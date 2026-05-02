// ═══════════════════════════════════════════════════════════════
// TRIBORO — World Content & Narrative Data
// ═══════════════════════════════════════════════════════════════

const WORLD = {

  // ── Boot sequence lines ──────────────────────────────────────
  bootMessages: [
    { text: "TRIBORO RESIDENTIAL NETWORK v11.3.8", delay: 400 },
    { text: "Initializing secure connection...", delay: 600 },
    { text: "WARNING: External network unavailable", delay: 400 },
    { text: "Aurora Smog Index: 847 PPM (HAZARDOUS)", delay: 500 },
    { text: "Years since last outside contact: 73", delay: 600 },
    { text: "Loading resident profile...", delay: 400 },
    { text: "Welcome back, Tenant #4407.", delay: 800 },
    { text: "You have 1 new message from BENNY.", delay: 600 },
    { text: "Launching Hack Hub Desktop...", delay: 1000 },
  ],

  // ── Almanapp social feed posts ───────────────────────────────
  // Each post has: author, handle, faction, avatar (emoji), text, time, likes, comments
  almanappPosts: [
    {
      author: "Babbage Family Press",
      handle: "@BabbageFP",
      faction: "media",
      avatar: "📰",
      text: "BREAKING: Triboro Council announces emergency session to address water rationing shortages on floors 30-45. Councilwoman Dey calls situation 'untenable.' Kirwin Foods offers to provide bottled water at 'competitive rates.' More at 6.",
      time: "2m ago",
      likes: 34,
      comments: 12
    },
    {
      author: "Gus Pelletier",
      handle: "@GusPelletier",
      faction: "league",
      avatar: "🔧",
      text: "Another day, another busted pipe on Floor 22. Management says they'll 'look into it.' Been looking into it for three weeks now. Good thing the League's got real plumbers. We'll have it fixed by tonight. That's the difference between talk and work.",
      time: "15m ago",
      likes: 67,
      comments: 8
    },
    {
      author: "Kirwin Foods Official",
      handle: "@KirwinFoods",
      faction: "kirwin",
      avatar: "🍎",
      text: "Introducing NEW Kirwin Comfort Bowls! Same great nutrition, now in three exciting flavors: Classic, Hearty, and Garden. Available at all Kirwin dispensaries, floors 1-60. Remember: Kirwin Feeds Triboro! 🌟",
      time: "32m ago",
      likes: 12,
      comments: 45
    },
    {
      author: "Dale Voss",
      handle: "@DaleVoss",
      faction: "resident",
      avatar: "👨",
      text: "Beautiful morning in Triboro. Well, as beautiful as fluorescent lighting gets. 😅 Heading to the commissary. Anyone need anything from Floor 12?",
      time: "1h ago",
      likes: 8,
      comments: 3
    },
    {
      author: "Security Branch HQ",
      handle: "@SecBranch",
      faction: "security",
      avatar: "🛡️",
      text: "REMINDER: Curfew on floors 50+ remains in effect 2200-0600. All residents must carry valid ID badges. Report suspicious activity to your floor warden. Together we keep Triboro safe. #SafeTriboro",
      time: "1h ago",
      likes: 5,
      comments: 31
    },
    {
      author: "Community Newsletter",
      handle: "@TBNewsletter",
      faction: "media",
      avatar: "📋",
      text: "THEATER DISTRICT UPDATE: This week's performance of 'Waiting for Sunlight' has been extended through Saturday due to popular demand. Tickets available at the Box Office, Floor 35. Support local arts!",
      time: "2h ago",
      likes: 41,
      comments: 6
    },
    {
      author: "Sister Maren",
      handle: "@SisterMaren",
      faction: "aurora_cult",
      avatar: "✨",
      text: "The Aurora is not our prison. It is our cocoon. When it lifts — and it will lift — we will emerge transformed. Morning meditation at the Chapel, Floor 55, 0700 daily. All are welcome. 🙏",
      time: "2h ago",
      likes: 9,
      comments: 14
    },
    {
      author: "Rita Cheng",
      handle: "@RitaCheng",
      faction: "resident",
      avatar: "👩",
      text: "Has anyone else noticed the weird humming from the east stairwell on Floor 38? Started three nights ago. Security says it's 'ventilation' but I've lived on this floor my whole life and never heard it before.",
      time: "3h ago",
      likes: 23,
      comments: 19
    },
    {
      author: "League of Trades Local 1",
      handle: "@LeagueLocal1",
      faction: "league",
      avatar: "⚙️",
      text: "REMINDER: Monthly membership meeting TONIGHT, 1900, Union Hall (Floor 20). Agenda includes water system repairs, elevator maintenance schedule, and a vote on the proposed Kirwin contract. All dues-paying members must attend.",
      time: "3h ago",
      likes: 52,
      comments: 4
    },
    {
      author: "Tommy Bao",
      handle: "@TommyBao",
      faction: "resident",
      avatar: "🧑",
      text: "Year 73 without seeing the sky. But hey, at least the WiFi's working today. Small victories. #TriboroLife",
      time: "4h ago",
      likes: 156,
      comments: 22
    },
    {
      author: "Babbage Family Press",
      handle: "@BabbageFP",
      faction: "media",
      avatar: "📰",
      text: "OPINION: The upcoming Council election may be the most consequential in Triboro's history. With water shortages, rising Kirwin prices, and growing unrest on upper floors, voters face a clear choice. Full editorial on our site.",
      time: "4h ago",
      likes: 28,
      comments: 37
    },
    {
      author: "Dale Voss",
      handle: "@DaleVoss",
      faction: "resident",
      avatar: "👨",
      text: "Late night at the workshop again. Building something special for the community fair. Can't say more yet but I think people are really going to love it. 🔨",
      time: "6h ago",
      likes: 14,
      comments: 5
    },
    {
      author: "Kirwin Foods Official",
      handle: "@KirwinFoods",
      faction: "kirwin",
      avatar: "🍎",
      text: "Did you know? Kirwin Foods has fed Triboro for three generations without a single major supply disruption. That's reliability you can taste. #KirwinCares #FeedingTriboro",
      time: "7h ago",
      likes: 8,
      comments: 52
    },
    {
      author: "Anonymous",
      handle: "@truth_speaker_tb",
      faction: "unknown",
      avatar: "👤",
      text: "Why won't anyone talk about what's on Floor 61? The elevators skip it. The stairwell doors are welded shut. Security says it 'doesn't exist.' But I've seen the blueprints. It exists. What are they hiding?",
      time: "8h ago",
      likes: 89,
      comments: 41
    },
    {
      author: "Marla Voss",
      handle: "@MarlaVoss",
      faction: "resident",
      avatar: "👩‍🦰",
      text: "Making my famous recycled-grain bread today. Recipe on my page if anyone wants it! Nothing beats fresh bread smell to make this place feel like home. 🍞",
      time: "9h ago",
      likes: 31,
      comments: 7
    },
  ],

  // ── TB News articles ─────────────────────────────────────────
  newsArticles: [
    {
      source: "Babbage Family Press",
      headline: "Water Rationing Extended to Floors 30-45 as Pipe Infrastructure Deteriorates",
      body: `Triboro's aging water infrastructure continues to strain under demand, with rationing now affecting an additional fifteen floors. The League of Trades has offered to conduct emergency repairs, but Council authorization remains stalled in committee.

"We've got the people and the parts," said League spokesperson Gus Pelletier. "What we don't have is permission. Every day the Council delays, another family goes without running water for half the day."

Kirwin Foods has offered to fill the gap with bottled water shipments at what they call "emergency pricing" — though residents on affected floors report prices nearly triple the standard rate.

Councilwoman Adira Dey has called an emergency session for Thursday to address the crisis. "This is not a political issue," Dey said in a statement. "This is a basic human needs issue."

The Security Branch has deployed additional officers to affected floors to "maintain order during the transition period."`,
      time: "Today, 0930"
    },
    {
      source: "Babbage Family Press",
      headline: "Council Election Preview: Three Candidates, Three Visions for Triboro's Future",
      body: `With the Triboro Council election just weeks away, three candidates have emerged with starkly different platforms for the complex's future.

Incumbent Councilwoman Adira Dey is running on continued pragmatic governance, emphasizing infrastructure repair and diplomatic relations between factions. Critics say she's been too slow to act on the water crisis and too cozy with Kirwin Foods.

Challenger Marcus Webb, backed by the League of Trades, promises aggressive infrastructure investment and reduced dependence on Kirwin's food monopoly. "We built this place with our hands," Webb told supporters. "It's time the people who keep Triboro running had a real say in how it's run."

The surprise entry is Petra Novak, a former Aurora Cult member who left the organization last year. Running as an independent, Novak's platform centers on transparency and investigating what she calls "the hidden floors." Her rallies have drawn unexpectedly large crowds, particularly among younger residents.

Polling — such as it is in Triboro — suggests a tight three-way race.`,
      time: "Today, 0800"
    },
    {
      source: "Community Newsletter",
      headline: "Theater District Announces Spring Festival Lineup",
      body: `The Theater District (Floors 33-36) has announced its spring festival schedule, featuring twelve original productions over three weeks.

Highlights include "Waiting for Sunlight," a new drama about a family's first years inside Triboro, which has already sold out its initial run. Also featured: "The Elevator Doesn't Stop Here," a comedy about Security Branch bureaucracy, and "Aurora Borealis Dreams," a dance piece by the Cult's arts collective.

"Art is how we stay human in here," said festival organizer Jin Park. "When you can't go outside, you go inward. That's where the real stories are."

The festival runs March 15-April 5. Tickets available at the Box Office, Floor 35.`,
      time: "Yesterday, 1400"
    },
    {
      source: "TB Alerts",
      headline: "SMOG ALERT: Aurora Index Reaches 847 PPM",
      body: `The Aurora Monitoring Station reports today's external smog index has reached 847 parts per million, well above the 200 PPM threshold considered safe for human exposure.

All external vents on floors 1-10 have been sealed as a precaution. Residents are reminded that attempting to access external doors or windows is strictly prohibited and punishable under Triboro Residential Code Section 4.

"The seals are holding," said Chief Environmental Officer Diana Walsh. "There is no cause for alarm. The filtration systems are operating at full capacity."

The Aurora index has not dropped below 800 PPM in living memory. No resident currently alive has ever been outside. Official projections continue to estimate a "return to safe levels within 18-24 months" — a projection that has remained unchanged for over seventy years.`,
      time: "Yesterday, 0600"
    },
    {
      source: "Babbage Family Press",
      headline: "Kirwin Foods Proposes Exclusive Cafeteria Contract: League Pushes Back",
      body: `Kirwin Foods has submitted a proposal to the Triboro Council for an exclusive 5-year contract to operate all communal dining facilities in the complex, a move that has drawn sharp criticism from the League of Trades and independent food vendors.

Under the proposal, Kirwin would take over the 14 communal kitchens currently operated by independent cooks and League volunteers. In exchange, Kirwin promises "standardized nutrition, consistent supply, and a 10% reduction in meal costs."

League president Frank Delgado called the proposal "a power grab, plain and simple." He noted that the League-run kitchens on Floors 18-22 consistently receive higher resident satisfaction ratings than Kirwin-operated facilities.

"They want to control the food, they already control the supply chain. What's next, the water?" Delgado said.

Kirwin CEO Harold Kirwin III dismissed the criticism. "We're talking about feeding 6,000 people efficiently and affordably. Emotion doesn't fill stomachs. Systems do."

The Council is expected to vote on the proposal next month.`,
      time: "2 days ago"
    }
  ],

  // ── Character profiles for Almanapp ──────────────────────────
  profiles: {
    dale_voss: {
      name: "Dale Voss",
      handle: "@DaleVoss",
      avatar: "👨",
      bio: "Floor 27 resident. Hobbyist builder, community volunteer. Married to Marla. Just trying to make the best of things. 🔨",
      floor: 27,
      joined: "Year 48",
      posts: 342,
      followers: 89,
      following: 67,
      faction: "None"
    },
    marla_voss: {
      name: "Marla Voss",
      handle: "@MarlaVoss",
      avatar: "👩‍🦰",
      bio: "Baker. Maker. Floor 27. Sharing recipes and keeping spirits up, one loaf at a time. 🍞",
      floor: 27,
      joined: "Year 47",
      posts: 218,
      followers: 134,
      following: 52,
      faction: "None"
    },
    gus_pelletier: {
      name: "Gus Pelletier",
      handle: "@GusPelletier",
      avatar: "🔧",
      bio: "League of Trades, Plumbing Division. Third generation. Fixing what others break. Floor 20.",
      floor: 20,
      joined: "Year 41",
      posts: 891,
      followers: 412,
      following: 34,
      faction: "League of Trades"
    },
    benny: {
      name: "Benny",
      handle: "@BennyTheFix",
      avatar: "🎭",
      bio: "I know a guy who knows a guy. DMs open.",
      floor: "???",
      joined: "Year 60",
      posts: 44,
      followers: 23,
      following: 201,
      faction: "Independent"
    }
  },

  // ── Mission 1: The Suspicious Wife ───────────────────────────
  mission1: {
    title: "The Suspicious Wife",
    client: "Marla Voss",
    briefing: `Marla Voss (Floor 27) has contacted Benny about her husband Dale. She says he's been disappearing for hours at a time — says he's "at the workshop" but she's checked and he's not there. She thinks he's seeing someone.

She wants proof. Wants to know where he goes and who he's with.

Pay: 200 credits
Difficulty: Low
Tools needed: Almanapp access, maybe a fake profile`,

    // Dialogue tree with Benny (mission briefing)
    bennyIntro: [
      {
        speaker: "benny",
        text: "Hey. You awake? Got something for you.",
        responses: [
          { text: "I'm here. What's the job?", next: 1 },
          { text: "Depends. What's it pay?", next: 1 },
        ]
      },
      {
        speaker: "benny",
        text: "Domestic stuff. Lady on Floor 27 thinks her husband's stepping out. Name's Marla Voss. Wants someone to poke around, find out where he's actually going when he says he's 'at the workshop.'",
        responses: [
          { text: "Sounds simple enough.", next: 2 },
          { text: "I don't do marriage counseling, Benny.", next: 3 },
        ]
      },
      {
        speaker: "benny",
        text: "200 credits, easy money. Just check the husband's Almanapp activity, maybe set up a fake profile to chat him up. See if he spills anything.",
        responses: [
          { text: "Alright, I'll take it. What's the husband's name?", next: 4 },
          { text: "200 for snooping on some guy's social media? Done.", next: 4 },
        ]
      },
      {
        speaker: "benny",
        text: "Hey, everyone's gotta eat. And she's paying. 200 credits. You want it or not?",
        responses: [
          { text: "Fine. Give me the details.", next: 4 },
        ]
      },
      {
        speaker: "benny",
        text: "Dale Voss, @DaleVoss on Almanapp. Seems like a regular guy — posts about building stuff, community events. But Marla says he's been weird lately. Evasive. Check his posts, his connections. See if anything stands out. I'd start on Almanapp if I were you.",
        responses: [
          { text: "On it.", next: "mission_start" },
          { text: "Any leads on who he might be seeing?", next: 5 },
        ]
      },
      {
        speaker: "benny",
        text: "Marla mentioned he's been talking about the 'community fair' a lot. But there's no community fair scheduled anywhere she can find. Make of that what you will. Check Almanapp — look at his recent posts. There's something there.",
        responses: [
          { text: "Got it. I'll dig around.", next: "mission_start" },
        ]
      },
    ],

    // Dale's secret: he's building a surprise anniversary gift at a workshop
    // on Floor 33 (Theater District) — a hand-carved music box.
    // He's been secretive because it's a surprise for Marla.
    // The player discovers this through investigation and chooses what to tell Marla.

    // Dale's private messages (discoverable through investigation)
    dalePrivateClues: [
      {
        from: "Dale Voss",
        to: "Jin Park",
        text: "Jin — can I use the workshop space on 33 again tonight? Almost done with the project. Need maybe 3 more sessions. Please don't mention it to anyone, especially anyone from Floor 27."
      },
      {
        from: "Jin Park",
        to: "Dale Voss",
        text: "Of course, Dale. The space is yours after 8pm. Your secret's safe with me. She's going to love it."
      }
    ],

    // Conversation with Dale (via fake profile)
    daleChat: [
      {
        speaker: "dale",
        text: "Hey! Don't think we've met. You new around here?",
        responses: [
          { text: "Yeah, just moved to Floor 30. Still figuring this place out.", next: 1 },
          { text: "Relatively. I've been keeping to myself mostly.", next: 1 },
        ]
      },
      {
        speaker: "dale",
        text: "Welcome to Triboro! It's... something. 😅 If you need anything, don't hesitate to ask. I know a lot of the regulars.",
        responses: [
          { text: "Thanks! What do you do around here for fun?", next: 2 },
          { text: "I noticed you post about building things. What are you working on?", next: 3 },
        ]
      },
      {
        speaker: "dale",
        text: "Fun? Ha. Well, there's the Theater District — they've got great shows. I do some building and tinkering in my spare time. Keeps the hands busy, keeps the mind from wandering to... you know. The outside.",
        responses: [
          { text: "What kind of stuff do you build?", next: 3 },
          { text: "The Theater District — is that where you spend most of your time?", next: 4 },
        ]
      },
      {
        speaker: "dale",
        text: "Oh, all kinds of things. Practical stuff mostly — shelves, furniture, repairs. But right now I'm working on something... special. A personal project. Can't really talk about it yet though. 😊",
        responses: [
          { text: "Sounds mysterious! Is it for someone?", next: 5 },
          { text: "I get it. Gotta keep the creative process sacred.", next: 6 },
        ]
      },
      {
        speaker: "dale",
        text: "I spend a fair amount of time there, yeah. They've got a great workshop space on Floor 33. Jin Park lets me use it for my projects. Great community over there — the arts people, they really get it, you know?",
        responses: [
          { text: "What's your current project?", next: 3 },
          { text: "You go there pretty often then?", next: 7 },
        ]
      },
      {
        speaker: "dale",
        text: "Ha — yeah, it's for someone very important to me. It's a surprise though. Our anniversary's coming up and... well, it's hard to get someone a gift in a place like this. No stores, no Amazon. So you make something with your hands and hope it says what you can't.",
        responses: [
          { text: "That's really sweet. She's lucky.", next: 8 },
          { text: "An anniversary gift? What is it?", next: 9 },
        ]
      },
      {
        speaker: "dale",
        text: "Exactly! Haha. But yeah, it's been taking up a lot of my evenings. Worth it though. Some things you just have to do right.",
        responses: [
          { text: "Your partner doesn't mind the late nights?", next: 10 },
        ]
      },
      {
        speaker: "dale",
        text: "Yeah, most evenings lately. The project I'm working on is... detailed. Lot of fine work. But I'm almost done. Just a few more nights.",
        responses: [
          { text: "What kind of project needs that much time?", next: 5 },
        ]
      },
      {
        speaker: "dale",
        text: "Thanks. I just hope she likes it. We've been through a lot together — before Triboro, during the evacuation, the early days here. She deserves something beautiful in a place that isn't always, you know?",
        responses: [
          { text: "I'm sure she'll love it. What is it, if you don't mind?", next: 9 },
          { text: "That's a really good way to look at it.", next: "dale_done" },
        ]
      },
      {
        speaker: "dale",
        text: "Okay, but you can't tell ANYONE. I'm carving a music box. Found some old mechanisms in the salvage on Floor 8, and I've been carving the case from reclaimed wood. It plays a song from Outside — from before the Aurora. His grandmother used to hum it. No one in Triboro has heard it in decades. I think... I think it'll make her cry. The good kind.",
        responses: [
          { text: "Dale, that's one of the nicest things I've ever heard.", next: "dale_done" },
          { text: "Your secret's safe with me.", next: "dale_done" },
        ]
      },
      {
        speaker: "dale",
        text: "Ha — she thinks I'm 'up to something,' and she's right, just not in the way she thinks. I feel bad being secretive but it'll all make sense soon. Two more weeks.",
        responses: [
          { text: "She's going to love it. Trust me.", next: "dale_done" },
        ]
      },
    ],

    // Final report back to Benny
    resolution: [
      {
        speaker: "benny",
        text: "So? What's the verdict on Dale Voss? He stepping out?",
        responses: [
          {
            text: "He's not cheating. He's building Marla a handmade music box for their anniversary. It's a surprise.",
            next: "honest_report"
          },
          {
            text: "He's been spending time on Floor 33, Theater District. Couldn't confirm infidelity.",
            next: "vague_report"
          },
          {
            text: "Tell Marla her husband is cheating. She deserves to know.",
            next: "lie_report"
          },
        ]
      },
    ],

    endings: {
      honest_report: {
        bennyResponse: "Ha. A music box. That's... actually kind of sweet. Alright, I'll let Marla know she's got nothing to worry about without spoiling the surprise. Nice work. Clean job. 200 credits transferred.",
        narration: "You told the truth. Benny passes the info to Marla — carefully, without ruining Dale's surprise. Somewhere on Floor 27, a woman stops worrying. In two weeks, she'll hear a song she thought she'd never hear again.\n\nMission complete. +200 credits.\nTrust with Benny: Increased.",
        trustChange: 1
      },
      vague_report: {
        bennyResponse: "That's it? Floor 33, no confirmation? Come on, she's paying for answers, not shrugs. But fine. I'll pass it along. She can make her own call. 150 credits — I'm docking you for the incomplete work.",
        narration: "You played it safe. Marla gets a partial answer and will probably keep worrying. Dale's surprise stays safe. But you didn't really do the job.\n\nMission complete. +150 credits.\nTrust with Benny: Unchanged.",
        trustChange: 0
      },
      lie_report: {
        bennyResponse: "...You sure about that? Alright, your call. I'll tell her. That's going to blow up a marriage, you know that right? Whatever. Job done. 200 credits.",
        narration: "You lied. Marla will confront Dale. The surprise will be ruined — or worse, she won't believe him even when he shows her the music box. A marriage damaged, maybe destroyed, because you chose cruelty over truth.\n\nMission complete. +200 credits.\nTrust with Benny: Decreased. He'll remember you play dirty.",
        trustChange: -1
      }
    }
  },

  // ── Fake profile creation options ────────────────────────────
  fakeProfiles: [
    { name: "Alex Chen", bio: "New to Floor 30. Looking to meet people! 🙋", handle: "@alexchen_tb" },
    { name: "Sam Rivera", bio: "Transferred from East Wing. Hobbyist & tinkerer.", handle: "@sam_r_tb" },
    { name: "Jordan Ellis", bio: "Just here for the community vibes. ✌️", handle: "@j_ellis_30" },
  ],

  // ── Ambient notification messages ────────────────────────────
  ambientNotifications: [
    "🔔 TB ALERT: Water pressure restored on Floor 31. Floors 32-45 still affected.",
    "🔔 KIRWIN: Happy Hour at the Floor 15 cafeteria! 20% off Comfort Bowls, 1700-1900.",
    "🔔 SECURITY: Elevator 7 out of service for maintenance. Use Elevator 6 or stairs.",
    "🔔 THEATER: Tonight's showing of 'Waiting for Sunlight' begins at 1930, Floor 35.",
    "🔔 TB ALERT: Smog index holding steady at 847 PPM. All external seals nominal.",
    "🔔 LEAGUE: Emergency plumbing volunteers needed, Floor 22. Report to Gus Pelletier.",
    "🔔 COMMUNITY: Lost: orange tabby cat, answers to 'Pixel.' Last seen Floor 19. Please DM @RitaCheng.",
    "🔔 KIRWIN: New recycling incentive program! Bring empty containers to Floor 12 for credit.",
  ],

  // ── Terminal / Hack Hub flavor text ──────────────────────────
  hackHubWelcome: `╔══════════════════════════════════════════════╗
║           H A C K   H U B   v2.1            ║
║         Secure Workspace Environment         ║
╠══════════════════════════════════════════════╣
║  Status: ONLINE                              ║
║  Network: Triboro Internal Only              ║
║  Encryption: Active                          ║
║  Jobs Available: 1                           ║
╚══════════════════════════════════════════════╝

Type 'help' for commands or check your messages.`,

  terminalCommands: {
    help: `Available commands:
  jobs     — View available jobs
  status   — Check your status
  tools    — List available tools
  almanapp — Open Almanapp
  news     — Open TB News
  clear    — Clear terminal`,

    status: `TENANT #4407
Floor: 42
Generation: Third
Credits: 50
Reputation: Neutral
Active Jobs: 0
Completed Jobs: 0`,

    tools: `Available Tools:
  [ALMANAPP]  — Social network browser
  [TB NEWS]   — News feed reader
  [CHIMERA]   — Password analysis tool [LOCKED — requires Level 2]
  [SPOOF KIT] — Profile creation tool`,
  }
};
