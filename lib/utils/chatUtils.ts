import { PollCreationState, PollUpdateState, Intent } from '../models/chat';

/**
 * Detects the intent from a user message
 */
export function detectIntent(
  message: string, 
  currentState?: PollCreationState, 
  currentUpdateState?: PollUpdateState
): Intent {
  const msg = message.toLowerCase().trim();
  
  // Handle poll update flows first - these take priority when user is already in update mode
  if (currentUpdateState) {
    switch (currentUpdateState.step) {
      case 'select_poll':
        return 'update_poll_select';
      case 'select_field':
        return 'update_poll_field';
      case 'update_title':
        return 'update_poll_title';
      case 'update_options':
        return 'update_poll_options';
      case 'update_category':
        return 'update_poll_confirm'; // Category updates go to confirm
      case 'confirm_update':
        return 'update_poll_confirm';
    }
  }
  
  // Handle poll creation states
  if (currentState) {
    switch (currentState.step) {
      case 'category':
        return 'create_poll_category';
      case 'topic':
        return 'create_poll_topic';
      case 'options':
        return 'create_poll_options';
      case 'confirm':
        return 'create_poll_confirm';
    }
  }
  
  // Check for poll update requests - enhanced to catch more patterns
  if (msg.match(/\b(update|edit|modify|change)\b.*\bpoll\b/i) ||
      msg.match(/\bpoll\b.*\b(update|edit|modify|change)\b/i) ||
      msg.match(/\b(can you|could you|help me)\b.*\b(update|edit|modify|change)\b.*\bpoll\b/i)) {
    return 'update_poll';
  }

  // Enhanced pattern to detect adding options to existing polls
  if (msg.match(/\b(add|include)\b.*\b(option|choice)\b.*\b(to|in)\b.*\b(poll|the)\b/i) ||
      msg.match(/\b(add|include)\b.*\b(to|in)\b.*\b(poll|the)\b.*\b(option|choice)\b/i) ||
      msg.match(/\badd.*\b(option|choice).*\bto.*\b(\d+|first|1st|second|2nd|third|3rd)\b.*\bpoll\b/i) ||
      msg.match(/\bwant to add.*\b(option|choice).*\bto.*\b(poll|\d+|first|1st)\b/i) ||
      msg.match(/\bi want to add.*\b(to|in)\b.*\b(\d+|first|1st|second|2nd)\b.*\bpoll\b/i)) {
    return 'update_poll';
  }

  // Handle greeting patterns
  if (msg.match(/^(hi|hello|hey|good morning|good afternoon|good evening|greetings|what's up|sup)(!|\s|$)/i) ||
      msg === 'start' || msg === 'begin' || msg === 'help') {
    return 'greeting';
  }
  
  // Handle poll creation
  if (msg.match(/\b(create|make|add|new|start|begin|lets create|i want to create|i need to create|i would like to create|can i create|can you create|help me create|please create|build|design|setup|set up)\b.*\bpoll\b/i) ||
      msg.match(/\bpoll\b.*\b(create|creation|make|new|start|create one|make one|create a new one|build|design|setup|set up)\b/i) ||
      msg.match(/\b(i want a|i need a|can you make a|let's make a|how about a|what about a)\b.*\bpoll\b/i)) {
    
    // Check for specific domains that should trigger category selection
    if (msg.includes('railway') || 
        msg.includes('train') || 
        msg.includes('indian railway') || 
        msg.includes('irctc') || 
        msg.includes('airplane') || 
        msg.includes('aeroplane') || 
        msg.includes('aircraft') || 
        msg.includes('aviation') || 
        msg.includes('airline') || 
        msg.includes('flight') || 
        msg.includes('airport') || 
        msg.includes('flying') || 
        msg.includes('pilot') || 
        msg.includes('plane') ||
        msg.includes('real estate') || 
        msg.includes('property') ||
        msg.includes('housing') ||
        msg.includes('apartment')) {
      return 'create_poll'; // This will auto-detect category and skip to topic
    }
    
    return 'create_poll';
  }
  
  // Handle poll listing
  if (msg.match(/\b(show|list|display|view|see|get)\b.*\bpolls?\b/i) ||
      msg.match(/\bpolls?\b.*\b(available|active|current|show|list|display)\b/i) ||
      msg.match(/\bwhat.*\bpolls?\b.*\b(available|there|active)\b/i) ||
      msg === 'polls' || msg === 'show polls' || msg === 'list polls') {
    return 'list_polls';
  }
  
  // Handle recent polls
  if (msg.match(/\b(recent|latest|new|newest)\b.*\bpolls?\b/i) ||
      msg.match(/\bpolls?\b.*\b(recent|latest|new|newest)\b/i)) {
    return 'list_recent_polls';
  }
  
  // Handle user's voted polls
  if (msg.match(/\b(my|i)\b.*\bvot(ed|ing)\b.*\bpolls?\b/i) ||
      msg.match(/\bpolls?\b.*\b(voted|i voted|my votes)\b/i) ||
      msg.match(/\bwhat.*\bpolls?\b.*\b(voted|i voted)\b/i)) {
    return 'list_user_voted_polls';
  }
  
  // Handle my polls (admin)
  if (msg.match(/\b(my|mine)\b.*\bpolls?\b/i) ||
      msg.match(/\bpolls?\b.*\b(created|made|mine|my)\b/i) ||
      msg.match(/\bshow.*\bmy.*\bpolls?\b/i)) {
    return 'list_my_polls';
  }
  
  // Handle voting
  if (msg.match(/\b(vote|voting)\b/i) && !msg.includes('status') && !msg.includes('check')) {
    return 'vote';
  }
  
  // Handle vote status check
  if (msg.match(/\b(check|see|view)\b.*\b(vote|voting)\b.*\bstatus\b/i) ||
      msg.match(/\b(did i|have i)\b.*\bvot(e|ed)\b/i) ||
      msg.match(/\bvot(e|ed|ing)\b.*\b(status|check)\b/i)) {
    return 'check_vote_status';
  }
  
  // Handle poll results
  if (msg.match(/\b(result|results)\b/i) ||
      msg.match(/\bshow.*\bresult\b/i)) {
    return 'view_poll_results';
  }
  
  // Handle poll analytics (admin)
  if (msg.match(/\b(analytic|analytics|statistic|statistics|report|reports)\b/i)) {
    return 'poll_analytics';
  }
  
  // Handle poll deletion (admin)
  if (msg.match(/\b(delete|remove)\b.*\bpoll\b/i) ||
      msg.match(/\bpoll\b.*\b(delete|remove)\b/i)) {
    return 'delete_poll';
  }
  
  // Handle option suggestions
  if (msg.match(/\b(suggest|give|provide|help|think of|come up with|brainstorm)\b.*\b(option|choice)\b/i) ||
      msg.match(/\b(option|choice)\b.*\b(suggest|give|provide|help|idea)\b/i)) {
    return 'suggest_options';
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
  
  // Enhanced transportation and aviation detection (categorize as Other) - ENHANCED FOR AVIATION
  if (msg.match(/\b(transport|transportation|travel|railway|railroad|train|metro|subway|bus|car|automobile|vehicle|aircraft|airplane|aeroplane|plane|aviation|airline|flight|airport|flying|pilot|captain|cockpit|runway|takeoff|landing|departure|arrival|boarding|passenger|cargo|freight|luggage|baggage|terminal|gate|check-in|security|customs|immigration|visa|passport|ticket|fare|route|destination|journey|trip|tour|tourism|vacation|holiday|cruise|ship|boat|ferry|yacht|sail|voyage|expedition|itinerary|map|gps|navigation|direction|distance|commute|commuter|rush hour|congestion|jam|toll|fuel|gas|diesel|electric vehicle|hybrid|infrastructure|maintenance|schedule|timetable|delay|cancellation|connecting|express|local|international|domestic|indian railway|irctc|railways|jet|boeing|airbus|helicopter|drone|air traffic|control tower|radar|turbulence|altitude|speed|mach|supersonic|cabin crew|flight attendant|steward|stewardess|wing|engine|propeller|turbine)\b/i)) {
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