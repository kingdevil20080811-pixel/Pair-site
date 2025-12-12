const express = require('express');
const fs = require('fs');
const { exec } = require("child_process");
const pino = require("pino");
const router = express.Router();
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    fetchLatestBaileysVersion,
    jidNormalizedUser
} = require("baileys");
const { upload } = require('./mega');

function removeFile(filePath) {
    if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    async function PrabathPair() {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(`./session`);
            const { version } = await fetchLatestBaileysVersion();

            const PrabathPairWeb = makeWASocket({
                version,
                auth: state,
                logger: pino({ level: "silent" }),
                printQRInTerminal: false,
            });

            if (!PrabathPairWeb.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g, '');
                const code = await PrabathPairWeb.requestPairingCode(num);
                if (!res.headersSent) {
                    return res.send({ code });
                }
            }

            PrabathPairWeb.ev.on('creds.update', saveCreds);

            PrabathPairWeb.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {
                    try {
                        await delay(10000);

                        const authPath = './session/';
                        const user_jid = jidNormalizedUser(PrabathPairWeb.user.id);

                        function randomMegaId(length = 6, numberLength = 4) {
                            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                            let result = '';
                            for (let i = 0; i < length; i++) {
                                result += chars.charAt(Math.floor(Math.random() * chars.length));
                            }
                            const number = Math.floor(Math.random() * Math.pow(10, numberLength));
                            return `${result}${number}`;
                        }

                        const megaUrl = await upload(fs.createReadStream(authPath + 'creds.json'), `${randomMegaId()}.json`);
                        const string_session = megaUrl.replace('https://mega.nz/file/', '');

                        await PrabathPairWeb.sendMessage(user_jid, { text: string_session });

                        removeFile('./session'); 
                        
                    } catch (e) {
                        console.error(e);
                        exec('pm2 restart prabath-md');
                    }
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error?.output?.statusCode !== 401) {
                    
                    await delay(10000);
                    PrabathPair().catch(console.error);
                }
            });

        } catch (err) {
            console.error(err);
            removeFile('./session');
            exec('pm2 restart prabath-md');
            if (!res.headersSent) {
                return res.status(503).send({ code: "Service Unavailable" });
            }
        }
    }

    await PrabathPair();
});

process.on('uncaughtException', function (err) {
    console.error('Caught exception: ', err);
    exec('pm2 restart prabath-md');
});

module.exports = router;
