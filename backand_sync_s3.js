var gulp = require('gulp');
var watch = require('gulp-watch');
var awspublish = require('gulp-awspublish');
var _ = require('underscore');
var fs = require('fs');
var del = require('del');
var awspublishRouter = require("gulp-awspublish-router");
var minimist = require('minimist');
var rename = require("gulp-rename");
var download = require('gulp-downloader');
var jeditor = require("gulp-json-editor");
var parallelize = require("concurrent-transform");


var sts_url = require('./config').sts_url;

var options = minimist(process.argv.slice(2));

var temporaryCredentialsFile = 'temporary-credentials.json';


function dist(folder){
    
    // get credentials
    var storedData = JSON.parse(fs.readFileSync(temporaryCredentialsFile, 'utf8'));

    var credentials = storedData.credentials;
    var info = storedData.info;
    var dir = info.dir;
    // create a new publisher using S3 options 
    // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#constructor-property 
    var publisherOptions = _.extend(credentials,   
      {
        params: {
          Bucket: info.bucket,
          // ACL: "public-read"
        },
        logger: process.stdout
      }
    );


    var publisher = awspublish.create(publisherOptions);
 
    // this will publish and sync bucket files with the one in your public directory 
    return gulp.src(folder + '/**/*.*')

        // rename extensions to lower case
        .pipe(rename(function (path) {
            path.extname = path.extname.toLowerCase();
        }))

        // set content type
        .pipe(awspublishRouter({
            routes: {

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

                "[\\w/\-\\s\.]*\\.jpg$": {
                    headers: {
                        "Content-Type": "image/jpg"
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

                "[\\w/\-\\s\.]*\\.html": {
                  headers: {
                    "Content-Type": "text/html"
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
        .pipe(awspublish.reporter());
}

function sts(username, password, accessToken){

    var downloadOptions = {
      url: accessToken ? sts_url : "https://" + username + ":" + password + "@" +   sts_url.replace(/http(s)?:\/\//, ''),
      method: 'POST'
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
            var credentials = { 
                accessKeyId: json.Credentials.AccessKeyId,
                secretAccessKey: json.Credentials.SecretAccessKey,
                sessionToken: json.Credentials.SessionToken
            };
            var info = {
                bucket: json.Info.Bucket,
                dir: json.Info.Dir
            }

            return {
                credentials: credentials,
                info: info
            };
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
    clean: clean
}