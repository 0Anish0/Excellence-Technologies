import { PollCreationState, PollUpdateState, Intent } from '../models/chat';

/**
 * Detects the user's intent from their message with enhanced natural language understanding
 */
export function detectIntent(message: string, pollCreationState?: PollCreationState, pollUpdateState?: PollUpdateState): Intent {
  const msg = message.toLowerCase().trim();

  // First, check for state reset keywords - these should always take priority
  const resetKeywords = [
    'cancel', 'stop', 'exit', 'quit', 'restart', 'start over', 'clear', 'reset',
    'help', 'start fresh', 'new conversation', 'begin again', 'abort'
  ];
  
  if (resetKeywords.some(keyword => msg.includes(keyword))) {
    // Don't return specific intents for these - let them be handled as general or specific commands
  }

  // Check for explicit intent overrides that should break out of current state
  const intentOverrides = [
    { patterns: [/\b(update|edit|modify|change|alter)\b.*\b(poll|survey)\b/i], intent: 'update_poll' },
    { patterns: [/\b(show|list|display|see|view)\b.*\b(polls?|available|all)\b/i], intent: 'list_polls' },
    { patterns: [/\b(my votes|voted|voting history)\b/i], intent: 'list_user_voted_polls' },
    { patterns: [/\b(create|make|new)\b.*\bpoll\b/i], intent: 'create_poll' },
    { patterns: [/\b(analytics|statistics|stats|performance)\b/i], intent: 'poll_analytics' },
    { patterns: [/\b(my polls|polls i created)\b/i], intent: 'list_my_polls' },
    { patterns: [/\b(recent|latest)\b.*\bpolls?\b/i], intent: 'list_recent_polls' },
    { patterns: [/\b(delete|remove)\b.*\bpoll\b/i], intent: 'delete_poll' }
  ];

  // Check for intent overrides first - these break out of current state
  for (const override of intentOverrides) {
    if (override.patterns.some(pattern => pattern.test(msg))) {
      return override.intent as Intent;
    }
  }

  // Simple affirmative responses when NOT in a state should default to general
  const simpleAffirmatives = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'y'];
  if (simpleAffirmatives.includes(msg) && !pollCreationState && !pollUpdateState) {
    return 'general';
  }

  // Enhanced greetings with more natural variations - these should also break state
  const greetings = [
    'hey', 'hello', 'hi', 'good morning', 'good afternoon', 'good evening', 'greetings', 
    'howdy', 'yo', 'hiya', 'whats up', "what's up", 'sup', 'hola', 'hey there', 'hi there',
    'morning', 'afternoon', 'evening', 'help', 'start', 'begin', 'welcome'
  ];
  if (greetings.some(greet => msg === greet || msg.startsWith(greet + ' ') || msg.startsWith(greet + ','))) {
    return 'greeting';
  }

  // Enhanced poll updating intents first
  if (msg.match(/\b(update|edit|modify|change|alter|revise|adjust)\b.*\b(poll|survey)\b/i) ||
      msg.match(/\b(poll|survey)\b.*\b(update|edit|modify|change|alter|revise|adjust)\b/i) ||
      msg.match(/\b(i want to|i need to|can i|how do i|let me|help me)\b.*\b(update|edit|modify|change)\b.*\b(poll|survey)\b/i) ||
      msg.includes('change poll') || msg.includes('edit poll') || msg.includes('modify poll') ||
      msg.includes('update my poll') || msg.includes('fix poll') || msg.includes('correct poll')) {
    
    if (pollUpdateState) {
      // Continue with current update flow
      switch (pollUpdateState.step) {
        case 'select_poll': return 'update_poll_select';
        case 'select_field': return 'update_poll_field';
        case 'update_title': return 'update_poll_title';
        case 'update_options': 
          // Check if user is clarifying their intent for options
          if (msg.includes('no') && (
              msg.includes('add') || 
              msg.includes('include') || 
              msg.includes('with the old') ||
              msg.includes('not remove') ||
              msg.includes('keep existing')
            )) {
            return 'clarify_poll_options_intent';
          }
          // Check if user explicitly wants to add options
          if (msg.includes('add') || 
              msg.includes('include') || 
              msg.includes('also') ||
              msg.includes('plus') ||
              msg.includes('append')) {
            return 'add_poll_options';
          }
          return 'update_poll_options';
        case 'confirm_update': return 'update_poll_confirm';
      }
    }
    return 'update_poll';
  }

  // Delete poll intent
  if (msg.match(/\b(delete|remove|cancel|close|terminate|stop|end)\b.*\b(poll|survey)\b/i) ||
      msg.match(/\b(poll|survey)\b.*\b(delete|remove|cancel|close|terminate|stop|end)\b/i) ||
      msg.includes('delete my poll') || msg.includes('remove poll') || msg.includes('cancel poll') ||
      msg.includes('close poll') || msg.includes('stop poll')) {
    return 'delete_poll';
  }

  // List my polls intent
  if (msg.match(/\b(my polls|show my polls|list my polls|polls i created|polls i made|my created polls|my poll list)\b/i) ||
      msg.match(/\b(show|list|display|see|view|get)\b.*\b(my|mine|created by me)\b.*\b(polls?|poll list)\b/i) ||
      msg.includes('what polls did i create') || msg.includes('polls i own') ||
      msg.includes('my poll dashboard') || msg.includes('polls i manage')) {
    return 'list_my_polls';
  }

  // Poll analytics intent
  if (msg.match(/\b(analytics|statistics|stats|metrics|performance|data|insights|analysis)\b.*\b(poll|survey)\b/i) ||
      msg.match(/\b(poll|survey)\b.*\b(analytics|statistics|stats|metrics|performance|data|insights|analysis)\b/i) ||
      msg.includes('poll performance') || msg.includes('voting data') || msg.includes('poll metrics') ||
      msg.includes('how is my poll doing') || msg.includes('poll insights')) {
    return 'poll_analytics';
  }

  // Enhanced show/list polls with more natural language understanding
  if (msg.match(/\b(show|list|display|see|view|get|what are|tell me about|available|can i see|i want to see|give me|show me|find|search for|browse|explore)\b.*\b(polls?|poll list|available polls|active polls|open polls)\b/i) ||
      msg === 'polls' || msg === 'show polls' || msg === 'list polls' || 
      msg.match(/\b(show|display|view|see)\b.*\b(my|the|created|all|available|active|open|current)\b.*\bpoll(s)?\b/i) ||
      msg === 'show me the poll' || msg === 'show poll' || 
      msg === 'what polls do you have' || msg === 'what polls are there' ||
      msg === 'can i see the polls' || msg === 'i want to see polls' || 
      msg === 'polls please' || msg === 'show me polls please' ||
      msg.match(/\b(any|what|which)\b.*\bpolls?\b.*\b(available|open|active|running)\b/i) ||
      msg.includes('poll options') || msg.includes('voting options') ||
      msg.match(/\bwhat can i vote (on|for)\b/i)) {
    return 'list_polls';
  }

  // Enhanced recent polls with more natural phrasing
  if (msg.match(/\b(recent|latest|new|last|newest|fresh|just added|recently added|most recent)\b.*\b(polls?|poll list)\b/i) ||
      msg.match(/\b(show|list|display|see|view|get|what are)\b.*\b(recent|latest|new|newest|fresh)\b.*\b(polls?)\b/i) ||
      msg.includes('recent polls') || msg.includes('latest polls') ||
      msg === 'what are the latest polls' || msg === 'show me recent polls' ||
      msg === 'what polls were added recently' || msg === 'newest polls' ||
      msg.includes('new polls') || msg.includes('just created polls')) {
    
    // Check for specific number of recent polls
    const numMatch = msg.match(/\b(recent|latest|new|last)\b.*\b(\d+)\b.*\bpolls?\b/i) || 
                    msg.match(/\b(\d+)\b.*\b(recent|latest|new|last)\b.*\b(polls?)\b/i);
    
    if (numMatch) {
      // This will be handled by the intent handler
      return 'list_recent_polls';
    }
    
    return 'list_recent_polls';
  }

  // Enhanced user voted polls detection
  if (msg.match(/\b(my votes|i voted|voted on|my voting|i have voted|what have i voted on|which polls have i voted on|polls i voted for|my vote history|voting history|my voting record)\b/i) ||
      msg.match(/\b(polls?)\b.*\b(i voted|i have voted|voted on|i've voted on|i participated in)\b/i) ||
      msg.includes('polls i voted on') || msg.includes('my voted polls') ||
      msg.includes('show me what i voted on') || msg.includes('show my votes') ||
      msg === 'what did i vote for' || msg.includes('my participation') ||
      msg.includes('polls i participated in') || msg.includes('where did i vote')) {
    return 'list_user_voted_polls';
  }

  // Handle more natural creation phrases with implicit category
  if (msg.match(/\b(create|make|add|new|start|begin|lets create|i want to create|i need to create|i would like to create|can i create|can you create|help me create|please create|build|design|setup|set up)\b.*\bpoll\b/i) ||
      msg.match(/\bpoll\b.*\b(create|creation|make|new|start|create one|make one|create a new one|build|design|setup|set up)\b/i) ||
      msg.match(/\b(i want a|i need a|can you make a|let's make a|how about a|what about a)\b.*\bpoll\b/i)) {
    
    // Check for specific domains that should trigger category selection
    if (msg.includes('railway') || 
        msg.includes('train') || 
        msg.includes('indian railway') || 
        msg.includes('irctc') || 
        msg.includes('real estate') || 
        msg.includes('realestate') ||
        msg.includes('property') ||
        msg.includes('education') ||
        msg.includes('health') ||
        msg.includes('medical') ||
        msg.includes('food') ||
        msg.includes('finance') ||
        msg.includes('sports') ||
        msg.includes('transport')) {
      return 'create_poll_category';
    }
    
    // If they're already specifying a topic in the initial request
    if (!pollCreationState) {
      return 'create_poll';
    } else if (pollCreationState.step === 'category' && detectCategory(msg)) {
      // If we detected a category from their message, skip right to topic
      return 'create_poll_category';
    }
  }

  // Only check poll creation state continuations if we're actually in poll creation
  if (pollCreationState) {
    // Check if in active poll creation and user wants to proceed - allow more natural language
    if (msg.includes('proceed') || 
        msg.includes('continue') || 
        msg.includes('previous') || 
        msg.includes('same question') ||
        msg.includes('create poll with') ||
        msg.includes('with this given option') ||
        msg.includes('yes') ||
        msg.includes('sure') ||
        msg.includes('okay') ||
        msg.includes('ok') ||
        msg.includes('go ahead') ||
        msg.includes('sounds good') ||
        msg.includes('that\'s fine') ||
        msg.includes('thats fine') ||
        msg.includes('looks good') ||
        msg.includes('yep') ||
        msg.includes('yeah') ||
        msg.includes('absolutely') ||
        msg.includes('perfect') ||
        msg.includes('exactly') ||
        msg.includes('correct') ||
        msg.includes('right') ||
        msg.includes('good') ||
        msg.includes('fine') ||
        msg.includes('agreed') ||
        msg.match(/^(y|yes|yep|yeah|ok|okay|sure|good|fine|right|correct|proceed|continue|go ahead)$/i)) {
      // Determine which step to continue with
      if (pollCreationState.step === 'category' && pollCreationState.category) {
        return 'create_poll_topic';
      } else if (pollCreationState.step === 'topic' && pollCreationState.topic) {
        return 'create_poll_options';
      } else if (pollCreationState.step === 'options' && pollCreationState.options) {
        return 'create_poll_confirm';
      } else {
        return 'continue_poll_creation';
      }
    }

    // Poll creation - handling direct category inputs
    if (msg.match(/\b(technology|politics|entertainment|other)\b/i) && pollCreationState.step === 'category') {
      return 'create_poll_category';
    }

    // When in category step, detect topic with implied category
    if (pollCreationState.step === 'category') {
      // Try to auto-detect the category
      const detectedCategory = detectCategory(msg);
      if (detectedCategory) {
        return 'create_poll_category';
      }
    }

    // Direct options input when in the options step - more context aware
    if (pollCreationState.step === 'options' && 
        (msg.includes(',') || msg.includes('*') || msg.includes('•') || 
         msg.match(/^\d+[\.\)]\s/) || msg.split(/\s+/).length <= 8 ||
         msg.includes('option') || msg.includes('choice'))) {
      return 'create_poll_options';
    }

    // Direct question input when in the topic step - enhanced detection
    if (pollCreationState.step === 'topic' && 
        (msg.endsWith('?') || msg.length > 10 || 
         msg.includes('best') || msg.includes('favorite') || msg.includes('prefer') ||
         msg.includes('which') || msg.includes('what') || msg.includes('who') ||
         msg.includes('how') || msg.includes('when') || msg.includes('where'))) {
      return 'create_poll_topic';
    }
  }

  // Enhanced poll options detection
  if (msg.match(/\b(show|get|what are|see|view|tell me|list|can i see|i want to see|give me|display)\b.*\b(options?|choices?|alternatives?|selections?)\b/i) ||
      msg.match(/\boptions?\b.*\b(poll|for|available|voting)\b/i) ||
      msg.match(/\bpoll\b.*\boptions?\b/i) ||
      msg.includes('what can i vote for') || msg.includes('what are the voting options') ||
      msg.includes('what choices do i have') || msg.includes('voting choices') ||
      msg.includes('available options') || msg.includes('poll choices')) {
    return 'get_poll_options';
  }

  // Enhanced voting intent with more natural variations
  if (msg.match(/\b(vote|cast|choose|select|pick|submit|participate|join|take part|make choice|i want to vote|let me vote|how do i vote|i'd like to vote|i choose|my choice is)\b/i) ||
      msg.match(/\bi want to vote\b/i) ||
      msg.match(/\bcan i vote\b/i) ||
      msg.match(/\bhow to vote\b/i) ||
      msg.includes('voting') || msg.includes('cast my vote') ||
      msg.includes('submit my choice') || msg.includes('make my selection') ||
      msg.includes('participate in poll') || msg.includes('join poll') ||
      msg.includes('take part in voting') || msg.includes('my vote is')) {
    return 'vote';
  }

  // Enhanced poll creation with more natural phrasing and context awareness
  if (msg.match(/\b(create|make|add|new|start|begin|create new|i want a new|i need a new|i would like a new|build|design|setup|set up|launch|initiate)\b.*\bpoll\b/i) ||
      msg.match(/\bpoll\b.*\b(create|creation|make|new|start|make a new|build|design|setup|set up|launch|initiate)\b/i) ||
      msg.match(/\bpoll.*(ai|education|medical|technology|politics|entertainment|real estate|realestate)\b/i) ||
      msg.match(/\bi want to create\b/i) || msg.match(/\bcan (i|we|you) create\b/i) ||
      msg === 'new poll' || msg === 'create poll' || msg === 'make a poll' ||
      msg === 'start a poll' || msg.includes('help me create a poll') ||
      msg.includes('i need a poll') || msg.includes('let\'s create a poll')) {
    if (msg.includes('category:') || msg.match(/\bcategory\b.*\b(is|:)\b/i)) {
      return 'create_poll_category';
    } else if (msg.includes('topic:') || msg.includes('question:')) {
      return 'create_poll_topic';
    } else if (msg.includes('options:') || msg.match(/\boption\b.*\b(add|set|list)\b/i)) {
      return 'create_poll_options';
    } else if (msg.includes('confirm') || msg.includes('cancel')) {
      return 'create_poll_confirm';
    } else if (msg.includes('restart') || msg.includes('start over')) {
      return 'create_poll_restart';
    } else {
      return 'create_poll';
    }
  }

  // Enhanced option suggestion with more natural phrasing
  if (msg.match(/\b(suggest|give|provide|help|make|create|recommend|propose|offer|can you suggest|i need|i want|think of|come up with|brainstorm)\b.*\b(options?|choices?|suggestions?|ideas?|alternatives?)\b/i) ||
      msg.match(/\boptions?\b.*\b(suggest|ideas|recommend|help|give me|think of|come up with|brainstorm)\b/i) ||
      msg.includes('what options should i include') ||
      msg.includes('i need help with options') ||
      msg.includes('what choices would be good') ||
      msg.includes('help me think of options') ||
      msg.includes('i don\'t know what options to add') ||
      msg.includes('i need suggestions') ||
      msg.includes('can you think of options') ||
      msg.includes('brainstorm options') ||
      msg.includes('suggest some choices')) {
    return 'suggest_options';
  }

  // Enhanced voting status check
  if (msg.match(/\b(did i vote|have i voted|voted already|my vote|voting status|check if i voted|see if i voted|tell me if i voted|verify vote|confirm vote)\b/i) ||
      msg.includes('check my vote') || msg.includes('verify my vote') ||
      msg.includes('show my voting status') || msg.includes('have i already voted') ||
      msg.includes('did i participate') || msg.includes('my voting record')) {
    return 'check_vote_status';
  }

  // Enhanced poll results viewing
  if (msg.match(/\b(result|results|status|outcome|how many voted|voting results|vote count|show me results|tell me results|who is winning|which option is winning|poll outcome|final results|current standings)\b.*\bpoll\b/i) ||
      msg.includes('what are the results') || msg.includes('current results') ||
      msg.includes('poll statistics') || msg.includes('what\'s the outcome') ||
      msg.includes('who won') || msg.includes('what\'s winning') ||
      msg.includes('vote tally') || msg.includes('poll performance') ||
      msg.includes('how is the poll doing') || msg.includes('poll analytics')) {
    return 'view_poll_results';
  }

  // Fallback to appropriate step if in poll creation and no specific intent
  if (pollCreationState) {
    if (pollCreationState.step === 'category') {
      // Try to auto-detect category from the message first
      const detectedCategory = detectCategory(msg);
      if (detectedCategory) {
        return 'create_poll_category';
      }
      return 'create_poll_category';
    } else if (pollCreationState.step === 'topic') {
      return 'create_poll_topic';
    } else if (pollCreationState.step === 'options') {
      return 'create_poll_options';
    } else if (pollCreationState.step === 'confirm') {
      return 'create_poll_confirm';
    }
  }

  // Fallback for poll update state
  if (pollUpdateState) {
    switch (pollUpdateState.step) {
      case 'select_poll': return 'update_poll_select';
      case 'select_field': return 'update_poll_field'; 
      case 'update_title': return 'update_poll_title';
      case 'update_options': return 'update_poll_options';
      case 'confirm_update': return 'update_poll_confirm';
    }
  }

  return 'general';
}

/**
 * Handles category detection for poll creation
 * Detects which pre-defined category a message belongs to
 */
export function detectCategory(message: string): string | null {
  const msg = message.toLowerCase().trim();
  
  // Direct category matches
  if (msg.includes('technology') || msg.includes('tech')) {
    return 'Technology';
  }
  if (msg.includes('politics') || msg.includes('political')) {
    return 'Politics';
  }
  if (msg.includes('entertainment')) {
    return 'Entertainment';
  }
  if (msg.includes('other')) {
    return 'Other';
  }

  // Smart category detection for technology
  if (msg.match(/\b(software|hardware|app|application|computer|device|gadget|programming|code|internet|web|digital|mobile|phone|laptop|data|ai|artificial intelligence|blockchain|crypto|machine learning|algorithm|tech|technology|it|information technology|computer science|robotics|automation|innovation|startup|cyber|security|cloud|database|network|server|coding|development|electronics|engineering|smart home|iot|internet of things|vr|ar|virtual reality|augmented reality|semiconductor|chip|processor|computing)\b/i)) {
    return 'Technology';
  }
  
  // Smart category detection for politics
  if (msg.match(/\b(government|election|vote|president|minister|democrat|republican|parliament|congress|senate|policy|law|legislation|party|candidate|campaign|debate|leader|nation|country|democracy|liberal|conservative|bjp|inc|aap|politics|modi|rahul|mla|mp|political|governance|diplomatic|foreign policy|domestic policy|administration|constitution|judiciary|supreme court|high court|bill|amendment|referendum|ballot|polling|civic|citizen|rights|freedom|taxation|regulation|opposition|majority|minority|ruling party|coalition|diplomat|embassy|international relations|trade policy|immigration|border|national security|defense|military|war|peace|treaty|agreement|sanction|protest|movement|activism|reform|corruption|scandal)\b/i)) {
    return 'Politics';
  }
  
  // Smart category detection for entertainment
  if (msg.match(/\b(movie|film|music|song|artist|actor|actress|celebrity|show|series|tv|television|netflix|hulu|disney|game|gaming|sport|sports|cricket|football|soccer|basketball|tennis|baseball|nfl|nba|match|player|coach|book|novel|fiction|theater|concert|festival|award|performance|media|play|dance|comedy|drama|action|thriller|horror|sci-fi|animation|box office|blockbuster|indie|director|producer|screenplay|script|studio|hollywood|bollywood|streaming|podcast|radio|album|band|musician|singer|rapper|tour|genre|pop|rock|hip hop|jazz|classical|broadway|theater|amusement|theme park|attraction|exhibit|gallery|museum|art|painting|sculpture|photograph|cinematography|choreography|ballet|opera)\b/i)) {
    return 'Entertainment';
  }
  
  // Transportation and travel detection (categorize as Other)
  if (msg.match(/\b(transport|transportation|travel|railway|railroad|train|metro|subway|bus|car|automobile|vehicle|aircraft|airplane|airline|flight|airport|station|terminal|transit|traffic|highway|road|street|avenue|bridge|tunnel|fare|ticket|passenger|driver|pilot|route|destination|journey|trip|tour|tourism|vacation|holiday|cruise|ship|boat|ferry|yacht|sail|voyage|expedition|itinerary|map|gps|navigation|direction|distance|commute|commuter|rush hour|congestion|jam|toll|fuel|gas|diesel|electric vehicle|hybrid|infrastructure|maintenance|schedule|timetable|delay|cancellation|boarding|arrival|departure|connecting|express|local|international|domestic|indian railway|irctc|railways)\b/i)) {
    return 'Other';
  }
  
  // Education and academic detection (categorize as Other)
  if (msg.match(/\b(education|school|college|university|institute|academy|campus|classroom|lecture|course|curriculum|syllabus|study|student|teacher|professor|faculty|degree|diploma|certificate|graduate|undergraduate|phd|doctorate|thesis|dissertation|research|academic|scholarship|admission|enrollment|exam|test|quiz|grade|score|mark|assignment|homework|project|laboratory|lab|library|textbook|notebook|semester|term|session|class|lecture|seminar|workshop|conference|education system|board|literacy|learning|teaching|training|skill|knowledge|subject|discipline|science|arts|commerce|engineering|medical|law|management|business|humanities|social sciences|stem|tuition|fee|grant|loan|dormitory|hostel|principal|dean|counselor|mentor|alumni)\b/i)) {
    return 'Other';
  }
  
  // Health and medical detection (categorize as Other)
  if (msg.match(/\b(health|healthcare|medical|medicine|hospital|clinic|doctor|physician|nurse|patient|treatment|therapy|diagnosis|symptom|disease|illness|condition|surgery|operation|prescription|medication|drug|vaccine|vaccination|immunization|prevention|cure|recovery|wellness|fitness|nutrition|diet|exercise|mental health|psychology|psychiatry|therapy|counseling|emergency|ambulance|paramedic|first aid|specialist|general practitioner|surgeon|pediatrician|gynecologist|cardiologist|neurologist|oncologist|radiologist|anesthesiologist|dentist|dental|ophthalmologist|optometrist|pharmacist|pharmacy|insurance|medicare|medicaid|epidemic|pandemic|virus|bacteria|infection|chronic|acute|terminal|palliative|intensive care|icu|ward|room|bed|admission|discharge|follow-up|checkup|screening|test|scan|x-ray|mri|ct scan|ultrasound|blood test|urine test|lab work)\b/i)) {
    return 'Other';
  }
  
  // Finance and economy detection (categorize as Other)
  if (msg.match(/\b(finance|financial|economy|economic|money|currency|dollar|euro|rupee|yuan|yen|pound|bank|banking|investment|investor|stock|share|bond|mutual fund|etf|market|exchange|trade|trading|broker|dealership|insurance|mortgage|loan|credit|debit|transaction|payment|income|revenue|profit|loss|expense|budget|saving|debt|interest|dividend|capital|asset|liability|equity|wealth|poverty|inflation|deflation|recession|depression|growth|gdp|gnp|fiscal|monetary|policy|tax|taxation|subsidy|grant|fund|funding|venture capital|private equity|cryptocurrency|bitcoin|ethereum|blockchain|fintech|accounting|audit|balance sheet|income statement|cash flow|forecast|projection|analysis|risk|return|portfolio|diversification|hedge|speculation|arbitrage|volatility|bull market|bear market|correction|crash|rally|boom|bust|cycle|trend|indicator|metric|ratio|percentage|basis point)\b/i)) {
    return 'Other';
  }
  
  // Food and culinary detection (categorize as Other)
  if (msg.match(/\b(food|cuisine|culinary|cooking|baking|recipe|ingredient|dish|meal|breakfast|lunch|dinner|snack|appetizer|entree|dessert|beverage|drink|restaurant|cafe|diner|bistro|eatery|kitchen|chef|cook|waiter|waitress|server|menu|order|reservation|takeout|delivery|fast food|fine dining|casual dining|buffet|catering|diet|nutrition|flavor|taste|spice|herb|seasoning|sweet|sour|salty|bitter|umami|vegetarian|vegan|pescatarian|omnivore|carnivore|organic|gmo|processed|fresh|raw|cooked|grilled|baked|fried|boiled|steamed|roasted|pizza|burger|sandwich|pasta|noodle|rice|bread|pastry|cake|cookie|ice cream|chocolate|coffee|tea|juice|soda|wine|beer|liquor|cocktail)\b/i)) {
    return 'Other';
  }
  
  // Real estate and property detection (categorize as Other)
  if (msg.match(/\b(real estate|realestate|property|house|housing|apartment|rent|lease|buy|sell|mortgage|loan|commercial|residential|broker|agent|listing|market|investment|condominium|condo|townhouse|duplex|bungalow|villa|mansion|cottage|studio|loft|penthouse|basement|attic|room|bedroom|bathroom|kitchen|living room|dining room|garage|yard|garden|lawn|pool|spa|balcony|patio|terrace|deck|porch|construction|renovation|remodel|repair|maintenance|inspection|appraisal|valuation|zoning|permit|code|regulation|homeowners association|hoa|community|neighborhood|suburb|urban|rural|downtown|uptown|city|town|village|development|builder|contractor|architect|interior design|exterior|landscape|curb appeal|staging|open house|showing|closing|escrow|title|deed|ownership|tenant|landlord|renter|occupancy|vacancy|utilities|amenities|facility|infrastructure)\b/i)) {
    return 'Other';
  }
  
  // Sports and athletics detection (categorize as Entertainment)
  if (msg.match(/\b(sport|sports|athletic|athlete|player|team|coach|manager|captain|championship|tournament|competition|match|game|league|conference|division|season|playoff|final|cup|trophy|medal|olympics|world cup|super bowl|wimbledon|cricket|football|soccer|basketball|baseball|tennis|golf|hockey|rugby|volleyball|badminton|swimming|diving|gymnastics|track|field|marathon|race|racing|boxing|wrestling|martial arts|karate|judo|taekwondo|mma|ufc|stadium|arena|court|field|pitch|rink|pool|gym|fitness|training|practice|drill|strategy|tactics|offense|defense|score|point|goal|run|basket|touchdown|home run|penalty|foul|referee|umpire|official|rules|regulation|draft|trade|contract|salary|sponsorship|endorsement|fan|spectator|supporter|ipl|bcci|fifa|nba|nfl|nhl|mlb)\b/i)) {
    return 'Entertainment';
  }
  
  return null; // Will default to "Other" in the handler
}

// Debug logging helper
export const createLogger = (isDebug: boolean = false) => {
  return {
    debug: (...args: any[]) => {
      if (isDebug) {
        console.log('[Chat Debug]', ...args);
      }
    },
    error: (...args: any[]) => {
      console.error('[Chat Error]', ...args);
    },
    info: (...args: any[]) => {
      console.log('[Chat Info]', ...args);
    }
  };
}; 