const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', (ws) => {
    console.log("Client connected");

    ws.on('message', (message) => {
        console.log(message.toString());

        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === 1){
                client.send(message.toString());
            }
        })
    })
})