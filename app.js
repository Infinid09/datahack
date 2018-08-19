"use strict";

const express = require("express");
const fs = require("fs");
const environmentVars = require("dotenv").config();

// Google Cloud
const speech = require("@google-cloud/speech");
const speechClient = new speech.SpeechClient(); // Creates a client

const bodyParser = require("body-parser");
const cors = require("cors");
var ConversationV1 = require("watson-developer-cloud/conversation/v1");

const app = express();
const port = process.env.PORT || 1337;
const server = require("http").createServer(app);

const io = require("socket.io")(server);

app.use(cors());
app.use(bodyParser.json());
app.use("/assets", express.static(__dirname + "/public"));
app.use("/session/assets", express.static(__dirname + "/public"));
app.set("view engine", "ejs");

var conversation = new ConversationV1({
  username: "8c1a1b7c-1d75-4a7c-9724-b2f3bc169dab", // replace with service username
  password: "MKORjXqjSGnD", // replace with service password
  version_date: "2017-05-26"
});

var workspace_id = "83f12c15-fa48-466e-97cb-d26365aed4f2"; // replace with workspace ID

// =========================== ROUTERS ================================ //

app.get("/", function(req, res) {
  res.render("index", {});
});

app.use("/", function(req, res, next) {
  next(); // console.log(`Request Url: ${req.url}`);
});

// =========================== SOCKET.IO ================================ //

io.on("connection", function(client) {
  console.log("Client Connected to server");
  let recognizeStream = null;

  client.on("join", function(data) {
    client.emit("messages", "Socket Connected to Server");
  });

  client.on("messages", function(data) {
    client.emit("broad", data);
  });

  client.on("startGoogleCloudStream", function(data) {
    startRecognitionStream(this, data);
  });

  client.on("endGoogleCloudStream", function(data) {
    stopRecognitionStream();
  });

  client.on("binaryData", function(data) {
    // console.log(data); //log binary data
    if (recognizeStream !== null) {
      recognizeStream.write(data);
    }
  });

  client.on('ibmwaton', function(req){
    contactIBMWatsonAssistant(req);
  });

  function startRecognitionStream(client, data) {
    recognizeStream = speechClient
      .streamingRecognize(request)
      .on("error", console.error)
      .on("data", data => {
        process.stdout.write(
          data.results[0] && data.results[0].alternatives[0]
            ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
            : `\n\nReached transcription time limit, press Ctrl+C\n`
        );
      //  client.emit("speechData", data);
        client.emit("userResponse",data);
        // if end of utterance, let's restart stream
        // this is a small hack. After 65 seconds of silence, the stream will still throw an error for speech length limit
        if (data.results[0] && data.results[0].isFinal) {
          stopRecognitionStream();
          startRecognitionStream(client);
          // console.log('restarted stream serverside');
        }
      });
  }

  function stopRecognitionStream() {
    if (recognizeStream) {
      recognizeStream.end();
    }
    recognizeStream = null;
  }

  function contactIBMWatsonAssistant(req) {
    console.log("req to ibm :",JSON.stringify(req));
    // Start conversation with empty message.
    const payload = {
      workspace_id,
      context: {},
      input: {}
    };

    // if (req.body) {
    //   if (req.body.input) {
    //     let inputstring = req.body.input.text;
    //     inputstring = inputstring.trim();
    //     payload.input.text = inputstring;
    //   }
    //   if (req.body.context) {
    //     payload.context = req.body.context;
    //   }
    // }
    if (req) {
      if (req.data) {
        let inputstring = req.data;
        inputstring = inputstring.trim();
        payload.input.text = inputstring;
      }
      if (req.context) {
        payload.context = req.context;
      }
    }

    conversation.message(payload, processResponse);

    function processResponse(err, data) {
      console.log(data);
      // client.emit("processedData", data.output.text[0]);
      checkForLookup(data, function (err, data) {
        if (err) {
          return res.status(err.code || 500).json(err);
        } else {
          // return res.json(data);
          client.emit("processedData", data);
        }
      });
    }

     // Process the conversation response.
  function checkForLookup(response, cb) {
    const payload = {
      workspace_id,
      context: response.context,
      output: { text: [] },
      input: response.input
    };

    response.context.action = {};
    cb(null, response);
  
  }
  }
});

// =========================== GOOGLE CLOUD SETTINGS ================================ //

// The encoding of the audio file, e.g. 'LINEAR16'
// The sample rate of the audio file in hertz, e.g. 16000
// The BCP-47 language code to use, e.g. 'en-US'
const encoding = "LINEAR16";
const sampleRateHertz = 16000;
const languageCode = "en-IN"; //en-US

const request = {
  config: {
    encoding: encoding,
    sampleRateHertz: sampleRateHertz,
    languageCode: languageCode,
    profanityFilter: false,
    enableWordTimeOffsets: true
  },
  interimResults: false // If you want interim results, set this to true
};

// =========================== START SERVER ================================ //

server.listen(port, function() {
  //http listen, to make socket work
  console.log("Server started on port:" + port);
});
