const logger = require('./modules/logger');
logger.init();
const winston = require('winston');
const express = require('express');
const mstream = express();
const fs = require('fs');
const bodyParser = require('body-parser');

const dbModule = require('./modules/db-management/database-master.js');
const jukebox = require('./modules/jukebox.js');
const sharedModule = require('./modules/shared.js');
const defaults = require('./modules/defaults.js');
const ddns = require('./modules/ddns');
const federation = require('./modules/federation');

exports.serveIt = function (program) {
  // Setup default values
  defaults.setup(program);

  // Logging
  if (program.writeLogs) {
    logger.addFileLogger(program.storage.logsDirectory);
  }

  // Set server
  var server;
  if (program.ssl && program.ssl.cert && program.ssl.key) {
    try {
      server = require('https').createServer({
        key: fs.readFileSync(program.ssl.key),
        cert: fs.readFileSync(program.ssl.cert)
      });
    } catch (error) {
      winston.error('FAILED TO CREATE HTTPS SERVER');
      error.code = 'BAD CERTS';
      throw error;
    }
  } else {
    server = require('http').createServer();
  }

  // Magic Middleware Things
  mstream.use(bodyParser.json()); // support json encoded bodies
  mstream.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
  mstream.use((req, res, next) => { // CORS
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  // Give access to public folder
  mstream.use('/public', express.static(program.webAppDirectory));
  // Serve the webapp
  mstream.get('/', (req, res) => {
    res.sendFile('mstream.html', { root: program.webAppDirectory });
  });
  mstream.get('/j/*', (req, res) => {
    res.sendFile( 'mstream.html', { root: program.webAppDirectory });
  });
  // Serve Shared Page
  mstream.all('/shared/playlist/*', (req, res) => {
    res.sendFile( 'shared.html', { root: program.webAppDirectory });
  });
  // Shared
  sharedModule.setupBeforeSecurity(mstream, program);

  // Login functionality
  program.auth = false;
  if (program.users && Object.keys(program.users).length !== 0) {
    require('./modules/login.js').setup(mstream, program, express);
    program.auth = true;
  } else {
    program.users = {
      "mstream-user": {
        vpaths: [],
        username: "mstream-user",
        admin: true
      }
    }

    // Fill in user vpaths
    for (var key in program.folders) {
      program.users['mstream-user'].vpaths.push(key);
    }

    // Fill in the necessary middleware
    mstream.use((req, res, next) => {
      req.user = program.users['mstream-user'];
      next();
    });
  }

  // Album art endpoint
  mstream.use('/album-art', express.static(program.storage.albumArtDirectory));
  // Download Files API
  require('./modules/download.js').setup(mstream, program);
  // File Explorer API
  require('./modules/file-explorer.js').setup(mstream, program);
  // Load database
  dbModule.setup(mstream, program);
  // Transcoder
  // require("./modules/ffmpeg.js").setup(mstream, program);
  // Finish setting up the jukebox and shared
  jukebox.setup(mstream, server, program);
  sharedModule.setupAfterSecurity(mstream, program);

  // TODO: Add middleware to determine if user has access to the exact file
  // Setup all folders with express static
  for (var key in program.folders) {
    mstream.use('/media/' + key + '/', express.static(program.folders[key].root));
  }

  // Start the server!
  server.on('request', mstream);
  server.listen(program.port, () => {
    const protocol = program.ssl && program.ssl.cert && program.ssl.key ? 'https' : 'http';
    winston.info(`Access mStream locally: ${protocol + '://localhost:' + program.port}`);

    dbModule.runAfterBoot(program);
    ddns.setup(program);
  });
}
