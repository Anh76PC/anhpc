// Dependencies
const login = require("facebook-chat-api");
const fs = require("fs");
const credential = { appState : JSON.parse(fs.readFileSync("dappstate.json", "utf-8"))};
const readline = require("readline");
const notifier = require("node-notifier");
const chalk = require('chalk');
const path = require('path');
const prompt = require('prompt');
var answeredThreads = {};
var botStatusThreads = {};
var isSimsimi = false;
var count = 0;
const simsimi = require('simsimi')({
    key: 'K8edeBsB5Ltf9M3vD5UdiZCO2IZZDhyonZMSbC~U', //key get here: https://workshop.simsimi.com
    lang: "vn",
});

// Global access variables
let gapi, active, rl;
useSimsimi = function (threadID, text, api) {
    (async () => {
        try {
            const response = await simsimi(text);
            api.sendMessage(response , threadID);
        } catch {
            	api.sendMessage("...", threadID);
        }
    })();
}
login(credential, (err, api) => {
	if(err) return console.error(err)
		api.listenMqtt(function callback(err, message) {
			//if(message.body && message.threadID != id && message.threadID != id) //chặn group hoặc ai đó ở đây
			{
				if (message.body && !answeredThreads.hasOwnProperty(message.threadID)) {
	
					answeredThreads[message.threadID] = true;
					api.sendMessage('Tôi đang offline bot sẽ nói chuyện với bạn khi bạn gõ "onbot".', message.threadID);
				}
				else if (message.body == "onbot" || message.body == "Onbot") {
					botStatusThreads[message.threadID] = true;
					isSimsimi = true;
					api.sendMessage("Đã bật bot (gõ offbot để tắt).", message.threadID);
				}
				else if (message.body == "offbot" || message.body == "Offbot")
				{
						isSimsimi = false;
						botStatusThreads[message.threadID] = false;
						api.sendMessage("Đã tắt bot.", message.threadID);
				}
				else if (message.body && isSimsimi && botStatusThreads.hasOwnProperty(message.threadID)) {
					 useSimsimi(message.threadID,message.body,api); 
				}
			}
		});
	
		
	});
/*
	Initializes a readline interface and sets up the prompt for future input.

	Returns the readline interface.
*/
function initPrompt() {
	if (!rl) {
		let rlInterface = readline.createInterface({
			"input": process.stdin,
			"output": process.stdout
		});
		rlInterface.setPrompt("> ");
		rl = rlInterface;
	}
}

/*
	Main body of the CLI.
gc
	Listens for new messages and logs them to stdout. Messages can be sent from
	stdin using the format described in README.md.
*/
function main(api) {
	// Use minimal logging from the API
	api.setOptions({ "logLevel": "warn", "listenEvents": true });
	// Initialize the global API object
	gapi = api;

	// Set up the prompt for sending new messages
	initPrompt();
	rl.prompt();

	// Listen to the stream of incoming messages and log them as they arrive
	api.listenMqtt((_err, msg) => {
		if (msg.type == "message") { // Message received
			api.getThreadInfo(msg.threadID, (_err, tinfo) => {
				api.getUserInfo(msg.senderID, (_err, uinfo) => {
					// If there are attachments, grab their URLs to render them as text instead
					const atts = msg.attachments.map(a => a.url || a.facebookUrl).filter(a => a);
					const atext = atts.length > 0 ? `${msg.body} [${atts.join(", ")}]` : msg.body;

					// Log the incoming message and reset the prompt
					const name = getTitle(tinfo, uinfo);
					newPrompt(`${chalk.blue(uinfo[msg.senderID].firstName)} in ${chalk.green(name)} ${atext}`, rl);
					// Show up the notification for the new incoming message
					notifier.notify({
						"title": 'Messenger CLI',
						"message": `New message from ${name}`,
						"icon": path.resolve(__dirname, 'assets', 'images', 'messenger-icon.png')
					});
				});
			});
		} else if (msg.type == "event") { // Chat event received
			api.getThreadInfo(msg.threadID, (_err, tinfo) => {
				api.getUserInfo(tinfo.participantIDs, (_err, tinfo) => {
					// Log the event information and reset the prompt
					newPrompt(`${chalk.yellow(`[${getTitle(tinfo, uinfo)}] ${msg.logMessageBody}`)}`, rl);
				});
			});
		} else if (msg.type == "typ") { // Typing event received
			if (msg.isTyping) { // Only act if isTyping is true, not false
				api.getThreadInfo(msg.threadID, (_err, tinfo) => {
					api.getUserInfo(msg.from, (_err, uinfo) => {
						// Log who is typing and reset the prompt
						newPrompt(`${chalk.dim(`${typer.firstName} is typing in ${getTitle(tinfo, uinfo)}...`)}`, rl);
					});
				});
			}
		}
	});

	// Watch stdin for new messages (terminated by newlines)
	rl.on("line", (line) => {
		const terminator = line.indexOf(":");
		if (terminator == -1) {
			// No recipient specified: send it to the last one messaged if available; otherwise, cancel
			if (active) {
				sendReplacedMessage(line, active, rl);
			} else {
				logError("No prior recipient found");
				rl.prompt();
			}
		} else {
			// Search for the group specified in the message
			const search = line.substring(0, terminator);
			// Beginning of list function. Use: list:(number) Lists the latest (number) friends and the most recent message sent or recieved in the chat.
			if (search == "list") {
				const amount = line.substring(terminator + 1);
				api.getThreadList(parseInt(amount), null, [], (err, threads) => {
					if (!err) {
						for (let i = 0; i < threads.length; i++) {
							const id = threads[i].threadID;
							api.getThreadInfo(id, (_err, tinfo) => {
								api.getThreadHistory(id, 1, undefined, (_err, history) => {
									api.getUserInfo(tinfo.participantIDs, (_err, uinfo) => {
										console.log(chalk.cyan.bgMagenta.bold(getTitle(tinfo, uinfo)));
										for (let i = 0; i < history.length; i++) {
											const sender = history[i].senderID;
											const body = history[i].body;
											console.log(`${chalk.blue(uinfo[sender].name)}: ${body}`);
										}
									});
								});
							});
						}
					} else {
						callback(err);
					}
				});
			} else if (search == "load") {
				const search = line.substring(terminator + 1);
				getGroup(search, (err, group) => {
					if (!err) {
						// Store the information of the last recipient so you don't have to specify it again
						active = group;
						// Load older 10 messages
						api.getThreadHistory(group.threadID, 10, undefined, (err, history) => {
							if (!err) {
								for (let i = 0; i < history.length; i++) {
									console.log(`${chalk.green(history[i].senderName)}: ${history[i].body}`);
								}
								rl.setPrompt(chalk.green(`[${active.name}] `));
								timestamp = history[0].timestamp;
							}
							else {
								logError(err);
							}
						});
						// Update the prompt to indicate where messages are being sent by default
					} else {
						logError(err);
					}
				});
			} else if (search == "logout") { //Add a logout command.
				api.logout((err) => {
					if (!err) {
						console.log("Logged out");
						process.exit()
					}
				});
			} else {
				getGroup(search, (err, group) => {
					if (!err) {
						// Send message to matched group
						sendReplacedMessage(line.substring(terminator + 1), group, rl);

						// Store the information of the last recipient so you don't have to specify it again
						active = group;

						// Update the prompt to indicate where messages are being sent by default
						rl.setPrompt(chalk.green(`[${active.name}] `));
					} else {
						logError(err);
					}
				});
			}
		}
	});
}

/*
	Wrapper function for api.sendMessage that provides colored status prompts
	that indicate whether the message was sent properly.

	Provide a message, a threadId to send it to, and a readline interface to use
	for the status messages.
*/
function sendMessage(msg, threadId, rl, callback = () => { }, api = gapi) {
	api.sendMessage(msg, threadId, (err) => {
		if (!err) {
			newPrompt(chalk.red.bgGreen("(sent)"), rl);
		} else {
			logError("(not sent)");
		}

		// Optional callback
		callback(err);
	});
}

/*
	Logs the specified error (`err`) in red to stdout.
*/
function logError(err) {
	console.log(chalk.bgRed(err));
}

/*
	Takes a search query (`query`) and looks for a thread with a matching name in
	the user's past 20 threads.

	Passes either an Error object or null and a Thread object matching the search
	to the specified callback.
*/
function getGroup(query, callback, api = gapi) {
	const search = new RegExp(query, "i"); // Case insensitive
	api.getThreadList(100, null, [], (err, threads) => {
		if (!err) {
			let found = false;
			for (let i = 0; i < threads.length; i++) {
				const id = threads[i].threadID;
				api.getThreadInfo(id, (err, tinfo) => {
					api.getUserInfo(err ? [] : tinfo.participantIDs, (err, uinfo) => {
						// Check if the chat has a title to search based on
						const name = getTitle(tinfo, uinfo);
						if (!found && !err && name.search(search) > -1) {
							found = true;
							tinfo.threadID = id;
							tinfo.name = name;
							callback(null, tinfo);
						}
					});
				});
			}
		} else {
			callback(err);
		}
	});
}

/*
	Runs the specified message through a filterer to execute
	any special commands/replacements before sending the message.

	Takes a message to parse, a groupInfo object, and a readline Instance.
*/
function sendReplacedMessage(message, groupInfo, rl) {
	const msg = parseAndReplace(message, groupInfo);

	// parseAndReplace may return an empty message after replacement
	if (msg) {
		sendMessage(msg, groupInfo.threadID, rl);
	}
}

/*
	Replaces special characters/commands in the given message with the info
	needed to send to Messenger.

	Takes a message and a groupInfo object to get the replacement data from.

	Returns the fixed string (which can be sent directly with sendMessage).
*/
function parseAndReplace(msg, groupInfo, api = gapi) {
	let fixed = msg;

	/*
 		List of fixes to make.

		Each fix should contain "match" and "replacement" fields to perform the replacement,
		and optionally can contain a "func" field containing a function to be called if a match
		is found. The groupInfo object, api instance, and match data will be passed to the function.
	*/
	const fixes = [
		{
			// {emoji} -> group emoji
			"match": /{emoji}/ig,
			"replacement": groupInfo.emoji ? groupInfo.emoji.emoji : "👍"
		},
		{
			// {read} -> ""; send read receipt
			"match": /{read}/i,
			"replacement": "",
			"func": (groupInfo, api) => {
				api.markAsRead(groupInfo.threadID, (err) => {
					if (!err) { newPrompt(chalk.bgBlue("(read)"), rl); }
				});
			}
		},
		{
			// {bigemoji} -> send large group emoji
			"match": /{bigemoji}/i,
			"replacement": "",
			"func": (groupInfo, api) => {
				// api.sendMessage({
				// 	"emoji": groupInfo.emoji ? groupInfo.emoji.emoji : "👍 ",
				// 	"emojiSize": "large"
				// }, groupInfo.threadID, (err) => {
				// 	if (!err) { newPrompt(chalk.bgYellow("(emoji)"), rl); }
				// });
			}
		},
		{
			// {file|path/to/file} -> send file
			"match": /{file\|([^}]+)}/i,
			"replacement": "",
			"func": (groupInfo, api, match) => {
				const path = match[1];
				// api.sendMessage({
				// 	"attachment": fs.createReadStream(path)
				// }, groupInfo.threadID, (err) => {
				// 	if (!err) {
				// 		newPrompt(chalk.bgCyan("(image)"), rl);
				// 	} else {
				// 		logError(`File not found at path ${path}`);
				// 	}
				// });
			}
		}
	]

	for (let i = 0; i < fixes.length; i++) {
		// Look for a match; if found, call the function if it exists
		let fix = fixes[i];
		if (msg.search(fix.match) > -1 && fix.func) {
			fix.func(groupInfo, api, msg.match(fix.match));
		}
		// Make the replacements as necessary
		fixed = fixed.replace(fix.match, fix.replacement);
	}

	return fixed.trim();
}

/*
	Clears the line of an existing prompt, logs the passed message, and then replaces the
	prompt for further messages.
*/
function newPrompt(msg, rl) {
	// Clear the line (prompt will be in front otherwise)
	readline.clearLine(process.stdout);
	readline.cursorTo(process.stdout, 0);

	// Log the message
	console.log(msg);

	// Replace the prompt
	rl.prompt(true);
}

/*
	Determines a title for a chat based on threadInfo and userInfo objects.

	Takes in threadInfo and userInfo objects and returns a string title.
*/
function getTitle(tinfo, uinfo, api = gapi) {
	let name = tinfo.threadName;
	if (!name) {
		// If not, figure out who is in the chat other than the main user
		const others = tinfo.participantIDs.filter(id => (id != api.getCurrentUserID()));
		if (others.length > 1) {
			// If it's more than one person, it's an unnamed group
			// Name it "firstname1/firstname2/firstname3", etc.
			const names = others.map(id => uinfo[id].firstName);
			name = names.join("/");
		} else if (others.length == 1) {
			// Otherwise, just the two people – it's a PM
			// Name it the user's full name
			name = uinfo[others[0]].name;
		} else {
			// If len is 0, user is only one in a dead group chat
			name = "Empty chat";
		}
	}
	return name;
}
