var gulp =  require('gulp');
var watch = require('gulp-watch');
var awspublish = require('gulp-awspublish');
var _ = require('underscore');
var fs = require('fs');
var del =require('del');
var awspublishRouter = require("gulp-awspublish-router");
var minimist = require('minimist');
var rename = require("gulp-rename");
var download = require('gulp-downloader');
var jeditor = require("gulp-json-editor");
var parallelize = require("concurrent-transform");
var notify =  require("gulp-notify");
var colors =  require('colors');
var expect = require('gulp-expect-file');
var gulpIgnore =  require('gulp-ignore');
var path = require('path');



var config =  require('./config');
var options = minimist(process.argv.slice(2));

var temporaryCredentialsFile = './.backand-credentials.json';

// files with such characters are not synced
var specialChars = "[" + "@#" + "]";

function dist(folder, appName, service, destFolder){

    if (!service)
        service = "hosting";

    // get credentials
    var cred = fs.readFileSync(temporaryCredentialsFile, 'utf8');

    var storedData = JSON.parse(cred);

    if (appName){
        storedData = storedData[appName];
    }
    else {
        storedData = _.first(_.values(storedData))
    }

    if (!storedData){
        return gulp.src(folder)
            .pipe(notify({
                message: "No credentials for this app",
                title: "Failure",
                notifier: function (options, callback) {
                    console.log(options.title + ":" + options.message);
                    callback();
                }
            }));
    }

    var credentials = storedData[service].credentials;
    var info = storedData[service].info;
    var dir = info.dir;
    if (destFolder)
        dir = dir  + "/" + destFolder;


    // create a new publisher using S3 options
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property
    var publisherOptions = _.extend(credentials,
        {
            params: {
                Bucket: info.bucket,
                // ACL: "public-read"
            },
            //logger: process.stdout
        }
    );

    var successMessage = "the code was sync and now available in: https://" + info.bucket + "/" + dir;

    var publisher = awspublish.create(publisherOptions);

    // exclude files with special characters in name
    function condition(file){
        var suffix = file.path.substr(file.base.length);
        var re = new RegExp(specialChars);
        var flag = service === "hosting" && re.test(suffix);
        var warning = "Warning: Cannot sync files with characters: " + specialChars + " in the file name: ";
        if (flag){
            var message = warning + suffix;
            console.log(message.red);
        }
        return flag;
    }

    var pathValidation = 'index.html';
    if (service === "nodejs")
        pathValidation = "handler.js";

    try {
        fs.accessSync(folder + "/" + pathValidation, fs.F_OK);
        // Do nothing
    } catch (e) {
        console.error('the root folder doesn\'t have ' + pathValidation+ ' page and the web app may not be available'.yellow);
        
        // It isn't accessible
    }

    return gulp.src(folder + '/**/*.*')
        // exclude files with special characters in name
        .pipe(gulpIgnore.exclude(condition))

        // rename extensions to lower case
        .pipe(rename(function (path) {
            path.extname = path.extname.toLowerCase();
        }))

        // set content type
        .pipe(awspublishRouter({
            routes: {

                "[\\w/\-\\s\.]*\\.pdf$": {
                    headers: {
                        "Content-Type": "application/pdf"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.css$": {
                    headers: {
                        "Content-Type": "text/css"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.js$": {
                    headers: {
                        "Content-Type": "application/javascript"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.ts$": {
                    headers: {
                        "Content-Type": "application/x-typescript"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.jpg$": {
                    headers: {
                        "Content-Type": "image/jpg"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.bmp$": {
                    headers: {
                        "Content-Type": "image/bmp"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.tiff$": {
                    headers: {
                        "Content-Type": "image/tiff"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.ico$": {
                    headers: {
                        "Content-Type": "image/x-icon"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.jpeg$": {
                    headers: {
                        "Content-Type": "image/jpg"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.gif$": {
                    headers: {
                        "Content-Type": "image/gif"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.png$": {
                    headers: {
                        "Content-Type": "image/png"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.svg$": {
                    headers: {
                        "Content-Type": "image/svg+xml"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.html": {
                    headers: {
                        "Content-Type": "text/html"
                    },
                    key: dir + "/" + "$&"
                },

                "[\\w/\-\\s\.]*\\.zip": {
                    headers: {
                        "Content-Type": "application/zip"
                    },
                    key: dir + "/" + "$&"
                },

                "^.+$": {
                    headers: {
                        "Content-Type": "text/plain"
                    },
                    key: dir + "/" + "$&"
                },

            }
        }))

        // publisher will add Content-Length, Content-Type and headers specified above
        // If not specified it will set x-amz-acl to public-read by default
        //.pipe(publisher.publish())
        .pipe(parallelize(publisher.publish(), 10))

        .pipe(publisher.sync(dir + "/"))

        // create a cache file to speed up consecutive uploads
        .pipe(publisher.cache())

        // print upload updates to console
        .pipe(awspublish.reporter())
        .pipe(notify({
            message: successMessage.green,
            title: "Success",
            onLast: true,
            notifier: function (options, callback) {
                callback();
            }
        }));

}

function sts(username, password, accessToken, appName){

    var currentUrl = config.backand.protocol + "://" + config.backand.host + ":" + config.backand.port + "/1/syncInfo";

    if (fs.existsSync(temporaryCredentialsFile)) {
        credentials = JSON.parse(fs.readFileSync(temporaryCredentialsFile));
    }
    else{
        credentials ={};
    }

    var downloadOptions = {
        url: accessToken ? currentUrl : config.backand.protocol + "://" + username + ":" + password + "@" +
        config.backand.host + ":" + config.backand.port + "/1/syncInfo",
        method: 'POST' //todo: replace to config
    };
    if (accessToken){
        downloadOptions.headers = {
            'Authorization': 'Bearer' + " " + accessToken
        };
    }

    return download({
        fileName: temporaryCredentialsFile,
        request: downloadOptions
    })
        .pipe(jeditor(function(json) {   // must return JSON object.
            var stsCredentials = json;
            if (credentials[appName]){
                credentials[appName] = _.extend(credentials[appName], stsCredentials)
            }
            else{
                credentials[appName] = stsCredentials;
            }
            return credentials;
        }))
        .pipe(gulp.dest('.'))
        ;
}

function clean(){
    return del(['./.awspublish*']);
}


module.exports = {
    dist: dist,
    sts: sts,
    clean: clean,
    config: config
}

