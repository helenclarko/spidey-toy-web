// Activity catalogue.
// The original app builds its Hang Out / Team Up / Fight Villains lists from pack tags
// ("status:visible,filter:<Category>") served by smarttoy.org. The live server no longer returns
// any visible packs, only the 35 "required" system packs below (api_samples/packs_en_product1.json).
// So the grouping here is a best guess from pack names; ids and launch format (`pack.<id>`) are real.
// Adjust freely once the toy's own activity list is known (GET_PROFILE).

export const MODES = [
  { key: 'hangout', title: 'Hang Out', blurb: 'Chat, jokes, stories and games', icon: 'v3_tip_spider_man.png' },
  { key: 'teamup', title: 'Team Up', blurb: 'Missions and patrols with Spidey', icon: 'v4_spidy_power_on_color.png' },
  { key: 'fight', title: 'Fight Villains', blurb: 'Take on the bad guys', icon: 'v4_spider_man_shake.png' },
];

export const ACTIVITIES = [
  // Hang Out
  { id: 485, name: 'Jokes', mode: 'hangout', handle: 'joke.selector' },
  { id: 480, name: 'Stories', mode: 'hangout' },
  { id: 477, name: 'Games', mode: 'hangout', handle: 'games.phrase.selector' },
  { id: 487, name: "What's Up", mode: 'hangout', handle: 'whats.up.selector' },
  { id: 483, name: "How's School", mode: 'hangout', handle: 'hows.school.logic' },
  { id: 482, name: 'Chat', mode: 'hangout', handle: 'lets.chat.phrase.selector' },
  { id: 463, name: 'Time', mode: 'hangout' },
  { id: 464, name: 'Day of the Week', mode: 'hangout', handle: 'day.of.week' },
  { id: 472, name: 'Reminder', mode: 'hangout' },
  { id: 469, name: 'Alarm', mode: 'hangout' },
  // Team Up
  { id: 476, name: 'Side Missions', mode: 'teamup', handle: 'mission.phrase.selector' },
  { id: 479, name: 'Training Mission', mode: 'teamup' },
  { id: 489, name: 'Go On Patrol', mode: 'teamup', handle: 'patrol.phrase.selector' },
  { id: 490, name: 'Sweep The Area', mode: 'teamup', handle: 'sweep.phrase.selector' },
  { id: 478, name: 'Crime Report', mode: 'teamup', handle: 'crime.report' },
  { id: 468, name: 'Thwip', mode: 'teamup' },
  // Fight Villains
  { id: 466, name: 'Doc Ock Roxxon', mode: 'fight' },
  { id: 475, name: 'Mysterio', mode: 'fight' },
  { id: 506, name: 'Electro', mode: 'fight' },
];

// Every system pack the server lists (used by the Advanced "All packs" panel).
export const ALL_PACKS = [
  [454, '_menu_required'], [455, '_accel'], [463, 'Time'], [464, 'Day of the Week'], [466, 'Dok Ock Roxxon'], [468, 'Thwip'],
  [469, 'alarm'], [470, 'Guard Room'], [472, 'Reminder'], [474, 'Looping Test'], [475, 'Mysterio Bundle'], [476, 'Side Missions'],
  [477, 'Games'], [478, 'Crime Report'], [479, 'Training Mission'], [480, 'Stories'], [481, 'Eye Animation Test'], [482, 'chat'],
  [483, 'Hows School'], [485, 'Jokes'], [486, '_intro'], [487, 'Whats Up'], [488, 'POP'], [489, 'Go On Patrol'],
  [490, 'Sweep The Area'], [491, 'Connecting Menu Responses'], [493, 'Sales Demo'], [494, 'Patrick Test'], [501, 'Button Press'],
  [503, 'Onboarding Content'], [505, 'Amazon Responses'], [506, 'Electro Bundle'], [507, 'Menu Questions'], [508, 'Yes or no'],
  [509, 'Rapid Button Press'],
];

// Voice-command / menu handles listed in MainActivity.initMenuPhrases (83). Launched as PLAY_ACTIVITY [{handle}].
export const HANDLES = ['play.heroic.music', 'what.can.i.say', 'lets.chat.phrase.selector', 'sweep.phrase.selector', 'stop.guard', 'show.me.around', 'go.to.sleep', 'shut.up', 'be.quiet', 'with.great.power', 'secret.identity', 'know.peter.parker', 'doing.today', 'do.when.im.gone', 'how.old', 'do.for.fun', 'get.your.powers', 'who.are.your.parents', 'costume.uncomfortable', 'weather.today', 'day.of.week', 'the.time.is', 'how.are.you', 'look.behind.you', 'where.do.you.live', 'where.spider.bite', 'people.saved', 'moms.name', 'spider.sense.saying', 'know.batman', 'favorite.color', 'who.made.costume', 'webbing.made.of', 'your.favorite.food', 'whats.up.selector', 'looking.good', 'costume.made.of', 'your.best.friend', 'your.favorite.superhero', 'where.go.to.school', 'have.a.girlfriend', 'know.other.superheroes', 'like.to.shoot.webs', 'do.something', 'how.do.you.work', 'hows.school.logic', 'say.something', 'what.are.you', 'what.can.you.do', 'what.can.we.do', 'my.super.power', 'what.do.you.want.to.do', 'whats.my.name', 'whats.may.doing', 'set.the.alarm', 'give.me.update', 'current.battery.level', 'volume.down', 'volume.up', 'talk.about.mysterio', 'talk.about.electro', 'talk.about.doc.ock', 'talk.about.kraven', 'talk.about.lizard', 'talk.about.venom', 'talk.about.vulture', 'talk.about.carnage', 'whos.green.goblin', 'know.harry.osborn', 'hows.aunt.may', 'hows.uncle.ben', 'know.avengers', 'know.iron.man', 'know.tony.stark', 'know.thor', 'know.captain.america', 'know.black.widow', 'know.hawkeye', 'know.hulk', 'know.bruce.banner', 'know.black.panther', 'know.winter.soldier', 'talk.about.j.jonah'];
