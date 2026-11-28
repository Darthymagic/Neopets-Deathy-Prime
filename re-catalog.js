/**
 * Darthy Prime — Random Event catalogue
 * Built from the JellyNeo Random Events guide (https://www.jellyneo.net/?go=random_events)
 * for Plus 1.8.79 / non-plus 1.6.2. Patterns use the guide's wording with placeholders:
 *   [ITEM NAME] [PET NAME] [USERNAME] [#,###] [##,###] [###] [##] [#]
 *   [STAT] [DISEASE] [SPECIES] [FLASH GAME] [STOCK TICKER] [WORD] [BAND_NAME]
 * Types: np_gain, np_loss, item, stat, shop, gallery, lottery, nc, avatar,
 * neodeck, heal, disease, mood, unlock, flavour.
 * Flavour-only events are listed so they can be recognised and skipped.
 */
(function () {
  'use strict';
  if (window.DarthyPrimeRECatalog) return;

  const EVENTS = [
    {"type":"flavour","p":"A blue Kacheek in overalls walks up to you and boy does he smell. *Whew* He says, \"Hey you might find some exciting stuff in my Rubbish Dump located in Meri Acres!\"","section":"regular"},
    {"type":"flavour","p":"A blue Shoyru zooms down from the sky and lands nearby! Wheeee!!!","section":"regular"},
    {"type":"flavour","p":"A Blumaroo bounces past and says, \"Never ever give out your password!\"","section":"regular"},
    {"type":"item","p":"A chill runs up your spine and you feel someone behind you. Thankfully, it's just Jacko the Phantom painter here to give you [ITEM NAME]. He quickly fades away, and you decide to focus on your new item so you don't get the creeps.","section":"regular"},
    {"type":"flavour","p":"A draik flies past overhead, he is headed to Mystery Island.","section":"regular"},
    {"type":"item","p":"A faerie offers you an ice negg. \"Take this [ITEM NAME]! Be sure to visit the Neggery for all your neggy needs!\"","section":"regular"},
    {"type":"nc","p":"A fashionable Acara gives [PET NAME] a gift of 50 NC and says, \"Fashion is for everyone, darling!\"","section":"regular","n":50},
    {"type":"flavour","p":"A freshly-painted swamp gas Techo walks by. Ewww!","section":"regular"},
    {"type":"flavour","p":"A friendly faerie passed by to give you a quest, but you're already on one so she flew away. Oh well. Maybe next time.","section":"regular"},
    {"type":"np_loss","p":"A fungus ball is sitting nearby on a log... and it EXPLODES! You get confused and drop [###] NP.","section":"regular","tag":"fungus"},
    {"type":"np_loss","p":"A Ghost cackles insanely and steals [###] NP from you...","section":"regular","tag":"ghost"},
    {"type":"flavour","p":"A Ghost comes out of the ground and stares evilly at you.","section":"regular"},
    {"type":"np_loss","p":"A Ghost grins evilly and steals [###] NP from you...","section":"regular","tag":"ghost"},
    {"type":"flavour","p":"A Ghost rises out of the ground and says \"BOO!\"","section":"regular"},
    {"type":"np_loss","p":"A Ghost takes [###] NP from you and puts it on the money tree!","section":"regular","tag":"ghost"},
    {"type":"item","p":"A Ghostkerchief appears out of nowhere and approaches [PET NAME]! RUN AWAY! Wait... no. It just wants to be friends. Looks like a new Petpet is going home with you.","section":"regular","item":"Ghostkerchief"},
    {"type":"flavour","p":"A Gnorbu wanders past you. Suddenly, your feet feel cold. How odd.","section":"regular"},
    {"type":"flavour","p":"A green scorchio walks past and says, \"I hope you're having fun!\"","section":"regular"},
    {"type":"item","p":"A group of excited fans rush past you shouting \"[BAND_NAME]\" are playing tonight!!!","section":"regular","item":"Concert Hall ticket"},
    {"type":"flavour","p":"A gust of icy cold wind blows past you, chilling you to the bone.","section":"regular"},
    {"type":"avatar","p":"A herd of meepits holding clip boards and ring lights frantically run past you. I wonder where they're going?","section":"regular","tag":"Virtually Alive"},
    {"type":"item","p":"A mad cackle echos around you before Dr. Sloth appears! \"The price for this [ITEM NAME] is merely your unquestioning loyalty.\" You take the potion. He didn't mean that, right?","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"Apparently there is something going on at the top of the mountain!\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"Fancy a snowball fight?\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"Have you tried the slushies? I hear they are awfully good!\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"Hi there!\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"I used to be a game show host once. :(\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"Tally ho!\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"The Ice Caves are great... but watch out for the Frost Beast!\"","section":"regular"},
    {"type":"flavour","p":"A passing Bruce says, \"Who is throwing snowballs at me?!?!\"","section":"regular"},
    {"type":"item","p":"A passing zombie runs into you and doesn't even seem to notice. Once she's gone you realise she dropped a piece of a long lost treasure map!","section":"regular"},
    {"type":"flavour","p":"A red Poogle hops past and and says \"Hi!\"","section":"regular"},
    {"type":"flavour","p":"A robot Tuskaninny flies past you on fire! Help! Help! Dr. Sloth is after me!","section":"regular"},
    {"type":"flavour","p":"A Schnelly scampers past you. You attempt to catch it, but it manages to evade you. Aww, shucks.","section":"regular"},
    {"type":"item","p":"A Scorchio in a pointy, purple hat hands you the [ITEM NAME] and says, \"This will be a nice addition to your album!\"","section":"regular"},
    {"type":"mood","p":"A Shadow glides silently past, stealing all the joy from the world. [PET NAME] doesn't look very happy anymore.","section":"regular","tag":"depressed"},
    {"type":"flavour","p":"A slimy scamander slithers up to your foot and hisses at you!","section":"regular"},
    {"type":"flavour","p":"A Slorg wriggles by, leaving behind a slimy trail. Watch your step!","section":"regular"},
    {"type":"flavour","p":"A smug bug sits here eating a Scabu. He says, \"I'm going to eat all your Neopets food when you aren't looking!!!\"","section":"regular"},
    {"type":"flavour","p":"A speckled Xweetok runs up to you and says, \"Xandra was right! Spread the word!\" and runs off.","section":"regular"},
    {"type":"disease","p":"A stray wraith appears and [PET NAME] stoops down to pet it. [PET NAME] now has Achy Head . What else did you expect?","section":"regular"},
    {"type":"disease","p":"Aaa-choo! [PET NAME] starts sneezing like crazy! Looks like someone's got a little Pollenitus problem...","section":"regular"},
    {"type":"flavour","p":"Adee the Chia says, \"Did you know you can send Neopets to your friends?\"","section":"regular"},
    {"type":"flavour","p":"Adee the Chia says, \"Did you know you can send postcards to friends?\"","section":"regular"},
    {"type":"item","p":"An Alien Aisha approaches and hands you [ITEM NAME]. Gross.","section":"regular"},
    {"type":"item","p":"An Alien Aisha gives you a [ITEM NAME]! Maybe it's time for a trip to the Vending Machine....","section":"regular"},
    {"type":"flavour","p":"An earthquake! Quick! Hide under your desk! (You do have one in your Neohome, don't you?)","section":"regular"},
    {"type":"stat","p":"An evil-looking coconut bounces off [PET NAME]'s head! [PET NAME] is knocked senseless and loses a level!","section":"regular","stat":"level","n":1,"sign":-1},
    {"type":"item","p":"An old sea captain-turned-governor hands you a piece of a treasure map. \"Keep hold of this,\" he whispers. \"It's quite valuable.\" He then strolls away as if nothing had happened.","section":"regular"},
    {"type":"unlock","p":"An ominous looking Red Pteri strolls up to you and cackles, \"I hope you didn't want to actually do anything in Neopia today.\" *BRAAWWKK*","section":"regular"},
    {"type":"np_gain","p":"Bank error in your favour. Collect [#,###] NP.","section":"regular"},
    {"type":"unlock","p":"Boochi fires his ray gun at [PET NAME], but thankfully he misses!","section":"regular"},
    {"type":"item","p":"Captain Limebeard says, \"Arrrgh! Yer not eatin' yer fruits an' vegetables! Ye better take this [ITEM NAME] b'fore ye get scurvy!\"","section":"regular"},
    {"type":"item","p":"Clarence Chichester Coggeshale hands you this [ITEM NAME] and tells you it would be a smashing addition to any ensemble.","section":"regular"},
    {"type":"flavour","p":"Did you know my name is pronounced \"sell-ee-uh\"?","section":"regular"},
    {"type":"item","p":"\"Don't let the shore be forgotten!\" The strange Krawk then hands you a Forgotten Shore Map Piece.","section":"regular"},
    {"type":"np_gain","p":"Dr. Sloth has his \"associates\" take 20% of your Neopoints away to support his next Neopian invasion effort.","section":"regular"},
    {"type":"avatar","p":"Dr. Sloth looks down on you as he passes by. He then turns the corner out of sight. You're still alive, so that's something.","section":"regular","tag":"Sloth!"},
    {"type":"flavour","p":"Gilly says, \"Have I ever told you the Tale of Woe? It's ever so spooky. Come along...\"","section":"regular"},
    {"type":"item","p":"Good afternoon, sir or madam. It seems we may have made a slight error with your account. Nothing to worry about, though; everything is just fine now. We've even reset your daily interest for today, so please stop on by to collect it. Please accept this Virtupets Toaster with our compliments.","section":"regular","item":"Bank interest is reset for the day and a Complimentary Virtupets Toaster"},
    {"type":"item","p":"Gordos the Collector sniffs and says, \"That's a pathetic stamp album! Accept my charitable donation of [ITEM NAME].\"","section":"regular"},
    {"type":"flavour","p":"Grarrg the Battle Master stomps past you, muttering something about war.","section":"regular"},
    {"type":"flavour","p":"GRUNDO MUST NOT EAT NEOPETS!!! GRUNDO FETCH NEOPETS FOR MASTER!","section":"regular"},
    {"type":"flavour","p":"\"Have you visited Krawk Island lately?\", Governor Gavril McGill asks. \"You'd be amazed by what I've done with the place.\"","section":"regular"},
    {"type":"item","p":"\"Here, have [ITEM NAME],\" King Skarl says to you. You're surprised there was any food left over from his latest banquet, and even more surprised that he'd share, but you put it in your pocket anyway.","section":"regular"},
    {"type":"flavour","p":"Hrm... I'll let you play [FLASH GAME] three more times today. You'll need the practice if you want to be as good as me!","section":"regular"},
    {"type":"np_loss","p":"Icy Skeletons surround you and steal [###] NP!","section":"regular"},
    {"type":"flavour","p":"If you like games and the NC Mall, perhaps give Shenanigifts a try!","section":"regular"},
    {"type":"flavour","p":"If you like games and the NC Mall, perhaps give Wonderclaw a try!","section":"regular"},
    {"type":"np_gain","p":"Illusen emerges from the woods and approaches you. \"I had some spare Neopoints lying around so I thought you may like to have them.\" She leaves you with 10,000 NP!","section":"regular"},
    {"type":"flavour","p":"It's raining... Mortogs?","section":"regular"},
    {"type":"flavour","p":"Isca swims happily past you, singing to herself. Perhaps you should follow her.","section":"regular"},
    {"type":"flavour","p":"Uggsul says, \"Ugga ugg Tyranu Evavu.\"","section":"regular"},
    {"type":"flavour","p":"Jhudora appears in a flash of purple and green smoke and says, \"Have you completed one of my quests, today?\"","section":"regular"},
    {"type":"np_gain","p":"King Skarl appears and orders his guards to collect [#,###] NP from you. Who knew there was such a thing as Marrow Tax?!","section":"regular"},
    {"type":"flavour","p":"Lawyerbot says, \"Ahh, there you are!\" and tries to serve you with a subpoena. You quickly dash away... Whew, that was close!","section":"regular"},
    {"type":"item","p":"Looks like you could use some more training. Here, take these Codestones and visit me at the Training School. Good luck!","section":"regular"},
    {"type":"unlock","p":"Meuka slimes up and eats your [ITEM NAME] right out of your inventory! Good news though, it looks like he left you a lovely lump of Snot !","section":"regular"},
    {"type":"flavour","p":"*Motes of light surround you.* You have received an invitation to visit Faerieland by Queen Fyora. What an honour! Maybe you will even see her there.","section":"regular"},
    {"type":"flavour","p":"Nigel the Stockbroker Chia says \"Have you considered investing in [[STOCK TICKER]]?\"","section":"regular"},
    {"type":"np_gain","p":"Not been paying your bills, eh? The ANGRY Tax Beast arrives and takes 25% of your Neopoints away... because he is ANGRY .","section":"regular"},
    {"type":"np_gain","p":"Not been paying your bills eh? The Tax Beast arrives and takes 10% of your Neopoints away!","section":"regular"},
    {"type":"item","p":"Oh, look! Jhudora appears and hands you a gift. That was ni- wait... Jhudora!? A gift?! Umm... are you sure you should have taken it?","section":"regular","item":"One of the following items"},
    {"type":"disease","p":"Oh, no... [PET NAME] doesn't look so well. It looks like [PET NAME] has suddenly come down with a bad case of [DISEASE]!","section":"regular"},
    {"type":"unlock","p":"Oh no! Boochi fires his ray gun and turns [PET NAME] into a Baby [SPECIES]!","section":"regular"},
    {"type":"flavour","p":"Ohhh, how cute. It seems one of your Petpets has got a Petpetpet in it's mouth. Wait a minute, that's just a leg!","section":"regular"},
    {"type":"stat","p":"OUCH! Count Von Roo appears in a puff of smoke and bites [PET NAME] on the neck!","section":"regular","stat":"hp","n":1,"sign":-1,"extra":["unlock:Count Von Roo"]},
    {"type":"item","p":"Pandora passes by and cheerfully hands you a Birthday Treasure Map Piece. \"Now your day will feel a bit more like a celebration!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] is looking for a good home! Why not adopt from the Neopian Pound?","section":"regular"},
    {"type":"stat","p":"[PET NAME] loses [#] [STAT] and says: It's been so long since I trained I feel a bit slow/weak. Can I do some [STAT] training?","section":"regular","stat":"level","n":1,"sign":-1},
    {"type":"flavour","p":"[PET NAME] says, \"Can we play hide and seek? That sounds like fun!\"","section":"regular"},
    {"type":"avatar","p":"[PET NAME] says, \"I heard the Neopets social media team does giveaways! You never buy me anything nice... Can we go?\"","section":"regular","tag":"Virtually Alive"},
    {"type":"flavour","p":"[PET NAME] says, \"Ice Cream! Buy me some Ice Cream!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says \"I just wanted to say that you are the coolest owner!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"I'm scared, there are so many horrible monsters out there!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"I think it's time you fed me!!!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"I want some more faeries! Find me some!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"Mmmmmm I love Neopoints, I want to be the richest pet in Neopia!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"Protect me from the evil Swamp Ghoul, please!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"*sigh* I want to play Meerca Chase!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"You don't play with me enough. I am bored!\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"You will buy me lots of presents from the Grooming Parlor wont you?\"","section":"regular"},
    {"type":"flavour","p":"[PET NAME] says, \"You're the best! I am so lucky to have you in my life.\"","section":"regular"},
    {"type":"stat","p":"[PET NAME] sneezes so hard, that a hit point is permanently lost!","section":"regular","stat":"hp","n":1,"sign":-1},
    {"type":"stat","p":"[PET NAME] starts babbling about something called Jelly World. How ridiculous! You'd guess intelligence just went down a few notches....","section":"regular","stat":"intelligence","n":1,"sign":-1},
    {"type":"flavour","p":"[PET NAME]'s stomach is rumbling.... I think they would like some food!","section":"regular"},
    {"type":"flavour","p":"Plesio says, \"Fancy spinning the Wheel of Mediocrity?\"","section":"regular"},
    {"type":"avatar","p":"Queen Fyora has put out a notice. It reads, \"A piece of Faerieland has been found still floating in the sky. For those up to the challenge, visit and help revitalise this land!\"","section":"regular","tag":"Virtually Alive"},
    {"type":"flavour","p":"SLOTH FIRES HIS RAY GUN AT YOU!!! Your [ITEM NAME] is turned into a mound of sludge!","section":"regular"},
    {"type":"stat","p":"SNOWBALL ATTACK! [PET NAME] gets hit by a snowball from above and takes [#] damage!","section":"regular","stat":"hp","n":3,"sign":-1},
    {"type":"flavour","p":"Sssidney whispersss, \"Sssoo... have you been to the Deserted Fairground lately?\"","section":"regular"},
    {"type":"np_loss","p":"Strong winds have caused substantial damage to your Neohome, which requires [#,###] NP for repairs.","section":"regular"},
    {"type":"np_gain","p":"Some members of the Pocket Change Redistribution Committee approach you and appropriate the [#,###] NP that you had in your pockets!","section":"regular"},
    {"type":"item","p":"Somebody from high up throws a [ITEM NAME] at you! You pick it up and flee!","section":"regular","extra":["unlock:challenger"]},
    {"type":"item","p":"Something seems to vanish out of the corner of your eye! When you turn to look, you only hear a mischievous little laugh. You find a crinkled piece of paper on the ground...","section":"regular"},
    {"type":"flavour","p":"The Black Pteri sits on a nearby fence post howling doom and misery for all to hear...","section":"regular","extra":["unlock:The Black Pteri"]},
    {"type":"np_gain","p":"The Bug Brothers jump up and steal [###] NP!!","section":"regular"},
    {"type":"flavour","p":"The Darkest Faerie Statue appears to be staring at you. You think it might be better to get as far away from it as possible... Can that much evil really be contained in a statue?","section":"regular"},
    {"type":"np_gain","p":"The Emperor of Shenkuu is throwing a festival for his daughters. You pay 16.67% of your Neopoints to help fund the event.","section":"regular"},
    {"type":"flavour","p":"The Faerie Queen smiles as she flutters by you. She hands you a small ticket that reads: \"Good for 10% off any one item in the Hidden Tower\". Shopping Trip!","section":"regular"},
    {"type":"heal","p":"The Ghost Lupe appears suddenly and growls before disappearing again. You realise all your Neopets are now at full health!","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe appears suddenly and growls before disappearing again. You wonder what that was all about...","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls \"Begone! Leave this place!\"","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls \"BEWARE!!!\"","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls \"Did you know that Mystery Island is haunted?\"","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls, \"Dont go to the Mystery Island!\"","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls \"If you have a Chia, I'll be your best friend... they are so tasty\"","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls, \"It's rumoured that neopets that go to Mystery Island never return!\"","section":"regular"},
    {"type":"flavour","p":"The Ghost Lupe growls, \"My what tasty Neopets you have!\"","section":"regular"},
    {"type":"np_gain","p":"The Golden Pteri flies overhead, but none of your Neopets are Pteris so he just flies away.","section":"regular"},
    {"type":"flavour","p":"The ghost of Coltzan appears to tell you the secret of receiving a million Neopoints from his shrine. Unfortunately, he seems to have Kikoughela today.","section":"regular"},
    {"type":"flavour","p":"The Grundo Leader attacks!!! He steals [ITEM NAME].","section":"regular"},
    {"type":"flavour","p":"The ice devil attacks!!! He steals [ITEM NAME].","section":"regular"},
    {"type":"np_loss","p":"The incessant mewing of a Mutant Kadoatie drives you completely mad, and you give its owner [#,###] NP to take it away!","section":"regular"},
    {"type":"flavour","p":"The Kiko Lake team is collecting donations so they can go to the Altador Cup this year. You donate [ITEM NAME]. How nice!","section":"regular"},
    {"type":"unlock","p":"The Lava Ghoul floats up to you and looks at you menacingly! You were lucky this time...","section":"regular"},
    {"type":"flavour","p":"The Mark of Ta-Kutep burns in the sky. You flee in fear!","section":"regular"},
    {"type":"flavour","p":"The Monocerous roars, \"Once I ate 16 JubJubs in a week!\"","section":"regular"},
    {"type":"unlock","p":"The pant devil attacks! He jumps into your inventory and steals your [ITEM NAME]. CURSES!!!","section":"regular"},
    {"type":"item","p":"The Pant Devil's evil twin hands you [ITEM NAME], stolen from his brother. He flies away cackling madly.","section":"regular"},
    {"type":"gallery","p":"The Shop Wizard wiggles his magical toes and suddenly your gallery has five more spaces!","section":"regular","n":5},
    {"type":"flavour","p":"The Snow Faerie says, \"All my sisters hate Terror Mountain, they say it's too cold. I love it here!\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"Brrr... I'm glad I have this warm coat on!\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"Have you looked at the Advent Calendar lately?\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"I hope your pets wrap up warm.\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"I must get some more Ice Neggs for tea!\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"I wish I could play Snow Wars as well as you. :(\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"I wonder what's at the top of the mountain...\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"It's toasty warm in this coat!\"","section":"regular"},
    {"type":"flavour","p":"The Snow Faerie says, \"They say an evil old man lives in a castle at the top of the mountain... I don't believe them!\"","section":"regular"},
    {"type":"flavour","p":"The Spider Grundo drops down from a nearby tree and stares at you...","section":"regular"},
    {"type":"flavour","p":"The Spider Grundo spins his web nearby... Best to move on, you wouldn't want to get caught in that.","section":"regular"},
    {"type":"flavour","p":"The Swamp Ghoul appears beside you and says, \"You're never safe... not from the Swamp Ghoul!\"","section":"regular"},
    {"type":"flavour","p":"The Swamp Ghoul sneaks up behind you and says, \"I will eat your Neopets for breakfast...\" and then he floats away","section":"regular"},
    {"type":"np_gain","p":"The Tooth Faerie arrives for [PET NAME]'s lost tooth and gives you [###] NP!","section":"regular","tag":"Tooth Faerie","extra":["avatar:Between 230 and 597 Neopoints are added to your on hand total and the Tooth Faerie"]},
    {"type":"flavour","p":"The word of the day is '[WORD]'!","section":"regular"},
    {"type":"unlock","p":"Vira suddenly appears before you. \"There is no way you could best me in the Battledome\", she sneers.","section":"regular"},
    {"type":"stat","p":"Was that... the ghost of Hubrid Nox? Your blood freezes in your veins and your heart shrinks. Your Neopet looks a little pale.","section":"regular","stat":"hp","n":2,"sign":-1},
    {"type":"flavour","p":"Watch out!! A Fire Faerie shoves you out of the way as a cloud from old Faerieland crashes to the ground.","section":"regular"},
    {"type":"np_loss","p":"\"What are ye lookin' at?\", a pirate demands. \"Yer Neopoints or ye'll walk the plank!\" You hastily hand over [#,###] NP.","section":"regular"},
    {"type":"item","p":"What's this? It seems you have found a piece of the secret laboratory map!","section":"regular"},
    {"type":"item","p":"What's this? It seems you have found a piece of the Secret Petpet Laboratory Map!","section":"regular"},
    {"type":"unlock","p":"What was that sound? Wait a minute... Your [ITEM NAME] is nowhere to be seen! Who could have taken it?","section":"regular"},
    {"type":"np_gain","p":"While out for a stroll, [PET NAME] looks down and finds [##,###] NP on the ground. Today looks like a lucky day!","section":"regular"},
    {"type":"flavour","p":"While pondering the spelling of 'faerie' you trip and fall in a hole. You're unharmed, but boy, was that ever embarrassing","section":"regular"},
    {"type":"flavour","p":"While you were admiring the Shimmery Seagrass, a Jawshell ate your [ITEM NAME]! Oh bother.","section":"regular"},
    {"type":"stat","p":"Whoa! [PET NAME] has suddenly gained a level! This is what happens after a balanced breakfast. At least that's what the Battle Faerie tells you.","section":"regular","stat":"level","n":1,"sign":1},
    {"type":"stat","p":"Whoa! [PET NAME] has suddenly gotten stronger! This is what happens after a balanced breakfast. At least that's what the Battle Faerie tells you.","section":"regular","stat":"strength","n":1,"sign":1},
    {"type":"neodeck","p":"Wow! The [ITEM NAME] Collectable Card has magically found its way into your Neodeck! What luck.","section":"regular"},
    {"type":"item","p":"Wow! You've found a Christmas Paint Brush in the snow! Finders keepers.","section":"regular","item":"Christmas Paint Brush"},
    {"type":"np_loss","p":"You feel a chill and a bit lighter... GAH, a ghost just stole [###] NP from you!","section":"regular","tag":"ghost"},
    {"type":"item","p":"You find a tasty [ITEM NAME] lying on the floor! Don't worry. It's totally fine to eat. Probably.","section":"regular","extra":["unlock:Sabre-X"]},
    {"type":"item","p":"You found a pile of scrap metal and some stones on the ground. What could they be for? Did some wayward Moltaran drop them accidentally? How odd...","section":"regular","item":"Scrap Metal and Stone"},
    {"type":"flavour","p":"You get home from a long day at the employment centre to find that all of your Neopoints and items have been stolen, your Neopets are sick and your stocks have... *shudder* Oh thank Fyora! It was just a horrible, horrible dream.","section":"regular"},
    {"type":"item","p":"You happen across a mystical codestone and promptly pick it up. Time for training!","section":"regular"},
    {"type":"item","p":"You happen upon a travelling library and are given a free copy of [ITEM NAME]. Enjoy!","section":"regular"},
    {"type":"np_gain","p":"You have stumbled upon the great Ice Treasure of [###] NP! This discovery will surely make you famous.","section":"regular","tag":"Ice Treasure"},
    {"type":"flavour","p":"You hear a jovial voice yelling to passersby. \"Fortune cookies! Fresh fortune cookies at Noda's! Get them while they're hot!\"","section":"regular"},
    {"type":"item","p":"You hear a loud explosion before [ITEM NAME] falls out of the sky and into your lap.","section":"regular"},
    {"type":"flavour","p":"You hear mysterious chanting coming from far away!","section":"regular"},
    {"type":"flavour","p":"You hear the unsettling laughter of Captain Scarblade... It can't be good that he is that happy.","section":"regular"},
    {"type":"lottery","p":"\"You look like you could use some luck!\" He hands you a lottery ticket with the following numbers: [##], [##], [##], [##], [##], [##]. \"I hope you win!\"","section":"regular"},
    {"type":"flavour","p":"You notice a kind Kougra handing out free Collectable Cards! If only you had a Neodeck.","section":"regular"},
    {"type":"flavour","p":"You run into a friendly Gelert named Bruno. He offers you a taste of this awesome new potion he found on the ground. You politely decline.","section":"regular"},
    {"type":"shop","p":"Your shop has suddenly increased in size! Wonder how that happened....","section":"regular","n":1},
    {"type":"item","p":"You spot Balthazar making a mad dash away from some pursuing faeries. In his haste, he drops [ITEM NAME] and you pick it up. Now... what do do with it?","section":"regular"},
    {"type":"item","p":"You spot something shiny on the ground and pick it up. It looks like a bead of some sort. Wonder what it's for...","section":"regular"},
    {"type":"np_gain","p":"Congratulations, [USERNAME], you just found [#,###] Neopoints!","section":"premium"},
    {"type":"item","p":"[ITEM NAME] suddenly falls from the sky and lands in your lap. The Space Faerie must be in a good mood!","section":"premium"},
    {"type":"item","p":"\"Looking for a new book? I have just the thing!\" Mira the Space Faerie smiles as she hands you a copy of [ITEM NAME].","section":"premium"},
    {"type":"item","p":"Mira the Space Faerie frowns at a plate of food she is holding. \"I know this is supposed to be gourmet, but I just don't think I can eat it... I hope you like [ITEM NAME], [USERNAME]!\"","section":"premium"},
    {"type":"item","p":"Mira the Space Faerie looks down at a piece of paper in her hand, then hands it to you when she spots you. \"I just can't seem to figure this [ITEM NAME] out... maybe you'll have better luck?\"","section":"premium"},
    {"type":"np_gain","p":"Today feels like a lucky day... And in fact, it is! You find [#,###] NP on the ground!","section":"premium"},
    {"type":"np_gain","p":"You feel rich in both mind and spirit... and your wallet reflects that with an additional [##,###] NP added to it!","section":"premium"},
    {"type":"item","p":"Coltzan's beloved pet, Sparky, has ascended. In honour of Sparky, Coltzan has presented you with a winged likeness of his beloved Petpet.","section":"onetime","item":"Sparky"},
    {"type":"item","p":"Victory awaits, if you're prepared! Equip your Neopet with this weapon before you charge into battle or they may end up black and blue.","section":"onetime","item":"Obsidian Dagger"}
  ];

  const PH = [
    { re: /\[ITEM NAME\]/g, key: 'item', cap: '(.+?)' },
    { re: /\[(?:#,###|##,###|###|##|#)\]/g, key: 'n', cap: '([\\d,]+)' },
    { re: /\[PET NAME\]/g, key: 'pet', cap: '(.+?)' },
    { re: /\[USERNAME\]/g, key: 'user', cap: '(.+?)' },
    { re: /\[STAT\]/g, key: 'stat', cap: '([A-Za-z][A-Za-z ]{1,20})' },
    { re: /\[DISEASE\]/g, key: 'disease', cap: '(.+?)' },
    { re: /\[SPECIES\]/g, key: 'species', cap: '(.+?)' },
    { re: /\[FLASH GAME\]/g, key: 'game', cap: '(.+?)' },
    { re: /\[STOCK TICKER\]/g, key: 'ticker', cap: '(.+?)' },
    { re: /\[WORD\]/g, key: 'word', cap: '(.+?)' },
    { re: /\[BAND_NAME\]/g, key: 'band', cap: '(.+?)' }
  ];

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function normalize(s) {
    return String(s || '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function compile(p) {
    let s = normalize(p);
    const keys = [];
    // tokenise placeholders before escaping
    const toks = [];
    PH.forEach((ph, i) => {
      s = s.replace(ph.re, function () { toks.push(i); return '\x00' + (toks.length - 1) + '\x00'; });
    });
    s = escapeRe(s)
      .replace(/\\?\s+/g, '\\s+')
      .replace(/\\\.\\\.\\\./g, '(?:\\.{2,3}|\\u2026)')
      .replace(/\\['']/g, "['\\u2018\\u2019]")
      .replace(/\\["]/g, '["\\u201c\\u201d]');
    s = s.replace(/\x00(\d+)\x00/g, function (_, n) {
      const ph = PH[toks[Number(n)]];
      keys.push(ph.key);
      return ph.cap;
    });
    // optional space before 's ( "[PET NAME] 's head" )
    s = s.replace(/\\s\+'s/g, "\\s*'s");
    return { re: new RegExp(s, 'i'), keys: keys };
  }

  // first distinctive clause (skip short "Whoa!" / "OUCH!" openers); only used when unique
  function firstClause(p) {
    const n = normalize(p);
    const re = /[.!?]/g;
    let m;
    while ((m = re.exec(n))) {
      if (m.index + 1 >= 28 && m.index + 1 < n.length - 8) return n.slice(0, m.index + 1);
    }
    return n;
  }
  const clauseCount = {};
  EVENTS.forEach(function (ev) {
    const h = firstClause(ev.p);
    clauseCount[h] = (clauseCount[h] || 0) + 1;
  });
  const compiled = EVENTS.map(function (ev) {
    const c = compile(ev.p);
    const head = firstClause(ev.p);
    const unique = head !== normalize(ev.p) && clauseCount[head] === 1;
    const h = unique ? compile(head) : null;
    return Object.assign({}, ev, { re: c.re, keys: c.keys, headRe: h && h.re, headKeys: h && h.keys, plen: ev.p.length });
  });
  // longer (more specific) patterns first; flavour last so a rewarding event is preferred
  compiled.sort(function (a, b) {
    const af = a.type === 'flavour' ? 1 : 0, bf = b.type === 'flavour' ? 1 : 0;
    if (af !== bf) return af - bf;
    return b.plen - a.plen;
  });

  function captures(ev, match) {
    const o = {};
    ev.keys.forEach(function (k, i) {
      const v = match[i + 1];
      if (v != null) o[k] = String(v).replace(/\s+/g, ' ').trim();
    });
    return o;
  }

  function classify(text) {
    const body = normalize(text).replace(/^(?:something has happened!?\s*|something is happening\.{0,3}\s*)+/i, '');
    if (!body || body.length < 8) return null;
    for (let i = 0; i < compiled.length; i++) {
      const ev = compiled[i];
      let m = ev.re.exec(body);
      let keys = ev.keys;
      if (!m && ev.headRe) { m = ev.headRe.exec(body); keys = ev.headKeys; }
      if (!m) continue;
      const cap = captures({ keys: keys }, m);
      const out = {
        type: ev.type,
        tag: ev.tag || '',
        item: cap.item || ev.item || '',
        pet: cap.pet || '',
        n: cap.n || ev.n,
        stat: ev.stat || cap.stat || '',
        sign: ev.sign || 0,
        disease: cap.disease || ev.tag || '',
        extra: ev.extra || [],
        section: ev.section,
        pattern: ev.p,
        skip: ev.type === 'flavour'
      };
      if (ev.type === 'nc' && out.n == null) out.n = ev.n || 50;
      return out;
    }
    return null;
  }

  window.DarthyPrimeRECatalog = {
    EVENTS: EVENTS,
    classify: classify,
    normalize: normalize
  };
})();
