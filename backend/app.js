require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const path = require('path');
const fs = require('fs');
const https = require('https');
const winston = require('winston');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

// SSL Certificate setup
const privateKey = fs.readFileSync(path.join(__dirname, '../sslcert', 'key.pem'), 'utf8');
const certificate = fs.readFileSync(path.join(__dirname, '../sslcert', 'cert.pem'), 'utf8');

const credentials = { key: privateKey, cert: certificate };

const app = express();
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Rate limiter setup
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'frontend' directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Serve the index.html file at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Verify the webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('WEBHOOK_VERIFIED');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming messages
app.post('/webhook', [
  body('entry').isArray(),
  body('entry[0].messaging').isArray(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const messaging_events = req.body.entry[0].messaging;

  for (let i = 0; i < messaging_events.length; i++) {
    const event = messaging_events[i];
    const sender = event.sender.id;

    if (event.message && event.message.text) {
      const message = event.message.text;

      // Display the received message
      logger.info(`Received message: ${message}`);

      // Store message
      storeMessage(sender, message);

      // Determine response based on keywords
      let responseText = getResponseBasedOnMessage(message);
      sendTextMessage(sender, responseText);
    } else if (event.postback && event.postback.payload) {
      // Handle Postback payloads
      const payload = event.postback.payload;
      logger.info(`Postback received with payload: ${payload}`);
      sendTextMessage(sender, `You clicked: ${payload}`);
    }
  }

  res.sendStatus(200);
});

// Determine response based on message content
function getResponseBasedOnMessage(message) {
  const lowerCaseMessage = message.toLowerCase();

  if (lowerCaseMessage.includes('hello')) {
    return 'Hi there! How can I assist you today?';
  } else if (lowerCaseMessage.includes('help')) {
    return 'Sure! What do you need help with?';
  } else if (lowerCaseMessage.includes('bye')) {
    return 'Goodbye! Have a great day!';
  } else {
    return `You said: ${message}`;
  }
}

// Send a text message
function sendTextMessage(sender, text) {
  const messageData = { text: text };

  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: {
      recipient: { id: sender },
      message: messageData,
    },
  }, (error, response, body) => {
    if (error) {
      logger.error('Error sending message: ', error);
    } else if (response.body.error) {
      logger.error('Error: ', response.body.error);
    }
  });
}

// Store message in JSON file
function storeMessage(sender, message) {
  fs.readFile(MESSAGES_FILE, (err, data) => {
    if (err) throw err;
    const messages = JSON.parse(data);

    messages.push({ sender, message, timestamp: new Date() });

    fs.writeFile(MESSAGES_FILE, JSON.stringify(messages, null, 2), (err) => {
      if (err) throw err;
      logger.info('Message saved.');
    });
  });
}

// Get stored messages
app.get('/messages', (req, res) => {
  fs.readFile(MESSAGES_FILE, (err, data) => {
    if (err) throw err;
    const messages = JSON.parse(data);
    res.json(messages);
  });
});

// HTTPS server
const port = process.env.PORT || 3000;

https.createServer(credentials, app).listen(port, () => {
  logger.info(`HTTPS server is listening on port ${port}`);
});
