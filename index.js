'use strict';

var Slack = require('slack-client'),
    bunyan = require('bunyan'),
    log = bunyan.createLogger({name: 'slackbot'}),
    imageSearch = require('./lib/image-search'),
    youtubeSearch = require('./lib/youtube-search'),
    greeting = require('./lib/greeting'),
    _ = require('lodash'),

    // constants
    constants = require('./lib/constants'),
    BOT_NAME = constants.BOT_NAME,

    // credential info
    TOKEN = process.env.SLACK_TOKEN,

    // create slack client and cron job
    slack = new Slack(TOKEN, true, true),
    cronJob = require('./lib/cron-job')(slack),
    fitbitUserList,
    totalTeamSteps = 0,
    maxUserId;
    
slack.on('open', function() {
    cronJob.start();
    // get the channel named fitbit
    // replace this hardcoded value with the channel called fitbit
    var channel = slack.getChannelGroupOrDMByID('C086PHK0B');
    fitbitUserList = {};
    for (var userId in channel._client.users) {
        fitbitUserList[userId] = 0;
        maxUserId = userId;
    }
});

slack.on('error', function(error) {
    log.error({error: error}, BOT_NAME + ' experienced some error.');
});

function getUserName(channel, userId) {
    return channel._client.users[userId].name;
}

function processFitbitData(channel, user, message) {
    if (channel.name === 'fitbit') {
        if (fitbitUserList[user.id] !== undefined) {
            // extract number of steps from message
            var numSteps = +message.text.replace(/[^\d.ex-]+/gi, '');
            fitbitUserList[user.id] += numSteps;
            totalTeamSteps += numSteps;
            if (fitbitUserList[maxUserId] < fitbitUserList[user.id]) {
                maxUserId = user.id;
            }
        } else {
            log.error('We have a foreign user messaging in the channel');
        }
        // print out total scores and who is winning
        var fitbitMsg = 'CSR Team\'s Accumulated Steps:\n';
        for (var userId in fitbitUserList) {
            fitbitMsg += getUserName(channel, userId) + ': ' + fitbitUserList[userId] + '\n';
        }
        fitbitMsg += 'The total number of steps taken by the team is ' +
        totalTeamSteps + '\n';
        fitbitMsg += getUserName(channel, maxUserId) + ' currently has the most steps.' +
        'Let\'s catch up!';
        channel.send(fitbitMsg);
    }
}

slack.on('message', function(message) {
    var channel = slack.getChannelGroupOrDMByID(message.channel),
        user = slack.getUserByID(message.user);
    if (!user) {
        return;
    }
    processFitbitData(channel, user, message);

    var msg = message.text,
        IMG_MSG_REGEX = new RegExp('^' + BOT_NAME + '( image| img| animate)( me)? (.*)'),
        YT_MSG_REGEX = new RegExp('^' + BOT_NAME + '( youtube| yt)( me)? (.*)'),
        imgMatch = msg.match(IMG_MSG_REGEX),
        ytMatch = msg.match(YT_MSG_REGEX);

    if (imgMatch && imgMatch[3]) {
        return imageSearch(imgMatch[3], function(err, img) {
            if (!err) {
                log.info({image: img}, BOT_NAME + ' sends image');
                channel.send(img);
            }
        });
    }

    if (ytMatch && ytMatch[3]) {
        return youtubeSearch(ytMatch[3], function(err, video) {
            if (!err) {
                log.info({video: video}, BOT_NAME + ' sends video.');
                channel.send(video);
            }
        });
    }
});

slack.on('userChange', function(user) {
    if (!user.deleted) {
        return greeting(slack, user.name)
    }
});

slack.login();
