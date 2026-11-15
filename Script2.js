const response = await fetch(
    "/data/greenland_GID001_data.json"
);

const data = await response.json();

console.log(data.timeseries);
console.log(data.observations);
const http = require("http");
const OpenAI = require("openai");
const readline = require("readline");

const PORT = 3000;

// ================================
// NHẬP API KEY KHI CHẠY
// ================================

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question("Nhap OpenAI API Key moi cua ban: ", (key) => {

    const API_KEY = key.trim();

    if (!API_KEY) {
        console.log("Ban chua nhap API Key.");
        rl.close();
        return;
    }

    const client = new OpenAI({
        apiKey: API_KEY
    });

    rl.close();

    // ================================
    // HTML GIAO DIEN
    // ================================

    const html = `
<!DOCTYPE html>
<html lang="vi">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>Mini AI</title>

<style>

* {
    box-sizing: border-box;
}

body {
    margin: 0;
    background: #eef1f7;
    font-family: Arial, sans-serif;
}

/* NUT CHAT */

#chatButton {

    position: fixed;

    right: 25px;
    bottom: 25px;

    width: 65px;
    height: 65px;

    border: none;

    border-radius: 50%;

    background: #111827;

    color: white;

    font-size: 27px;

    cursor: pointer;

    box-shadow:
        0 8px 25px rgba(0,0,0,.25);
}


/* CUA SO CHAT */

#chatWindow {

    position: fixed;

    right: 25px;
    bottom: 105px;

    width: 380px;
    height: 560px;

    display: none;

    background: white;

    border-radius: 20px;

    overflow: hidden;

    box-shadow:
        0 15px 50px rgba(0,0,0,.25);
}


/* HEADER */

#header {

    height: 65px;

    background: #111827;

    color: white;

    padding: 12px 18px;
}

#title {

    font-size: 19px;

    font-weight: bold;
}

#status {

    font-size: 12px;

    margin-top: 4px;

    opacity: .7;
}


/* LOGIN */

#login {

    padding: 25px;
}

#login h2 {

    margin-top: 0;
}

#login p {

    color: #555;

    line-height: 1.5;
}

#activate {

    width: 100%;

    padding: 13px;

    border: none;

    border-radius: 10px;

    background: #111827;

    color: white;

    cursor: pointer;

    font-size: 15px;
}


/* CHAT AREA */

#chat {

    display: none;

    height: calc(100% - 65px);
}

#messages {

    height: calc(100% - 65px);

    overflow-y: auto;

    padding: 15px;

    background: #f3f4f6;
}


/* MESSAGE */

.message {

    max-width: 82%;

    padding: 10px 13px;

    margin-bottom: 10px;

    border-radius: 13px;

    line-height: 1.45;

    white-space: pre-wrap;

    word-break: break-word;
}

.user {

    margin-left: auto;

    background: #111827;

    color: white;
}

.ai {

    margin-right: auto;

    background: white;

    color: #111827;

    box-shadow:
        0 1px 4px rgba(0,0,0,.08);
}


/* INPUT */

#inputArea {

    height: 65px;

    display: flex;

    gap: 8px;

    padding: 9px;

    background: white;

    border-top: 1px solid #ddd;
}

#input {

    flex: 1;

    border: 1px solid #ddd;

    border-radius: 10px;

    padding: 10px;

    outline: none;

    font-size: 14px;
}

#send {

    width: 60px;

    border: none;

    border-radius: 10px;

    background: #111827;

    color: white;

    cursor: pointer;
}

#send:disabled {

    opacity: .5;

    cursor: not-allowed;
}


/* MOBILE */

@media(max-width: 500px) {

    #chatWindow {

        right: 10px;
        bottom: 90px;

        width: calc(100% - 20px);

        height: 520px;
    }

}

</style>

</head>

<body>


<!-- NUT MO CHAT -->

<button id="chatButton">

💬

</button>


<!-- CUA SO -->

<div id="chatWindow">


    <!-- HEADER -->

    <div id="header">

        <div id="title">

            🤖 Mini AI

        </div>

        <div id="status">

            Chua kich hoat

        </div>

    </div>


    <!-- KICH HOAT -->

    <div id="login">

        <h2>

            Kich hoat Mini AI

        </h2>

        <p>

            AI cua ban dang chua duoc kich hoat.

            Hay nhan nut ben duoi de bat dau.

        </p>

        <button id="activate">

            Kich hoat AI

        </button>

    </div>


    <!-- CHAT -->

    <div id="chat">

        <div id="messages">

            <div class="message ai">

                Xin chao! Mini AI da san sang.

                Ban muon hoi gi?

            </div>

        </div>


        <div id="inputArea">

            <input

                id="input"

                type="text"

                placeholder="Nhap cau hoi..."

            >

            <button id="send">

                Gui

            </button>

        </div>

    </div>

</div>


<script>

const chatButton =
    document.getElementById("chatButton");

const chatWindow =
    document.getElementById("chatWindow");

const login =
    document.getElementById("login");

const chat =
    document.getElementById("chat");

const activate =
    document.getElementById("activate");

const status =
    document.getElementById("status");

const input =
    document.getElementById("input");

const send =
    document.getElementById("send");

const messages =
    document.getElementById("messages");


/* MO CHAT */

chatButton.onclick = function() {

    if (chatWindow.style.display === "block") {

        chatWindow.style.display = "none";

    } else {

        chatWindow.style.display = "block";

    }

};


/* KICH HOAT */

activate.onclick = function() {

    login.style.display = "none";

    chat.style.display = "block";

    status.textContent =
        "● AI dang hoat dong";

    input.focus();

};


/* THEM TIN NHAN */

function addMessage(text, type) {

    const message =
        document.createElement("div");

    message.className =
        "message " + type;

    message.textContent =
        text;

    messages.appendChild(message);

    messages.scrollTop =
        messages.scrollHeight;

    return message;
}


/* GUI */

async function sendMessage() {

    const text =
        input.value.trim();

    if (!text) return;

    addMessage(text, "user");

    input.value = "";

    const loading =
        addMessage(
            "AI dang suy nghi...",
            "ai"
        );

    send.disabled = true;

    try {

        const response =
            await fetch("/chat", {

                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json"
                },

                body: JSON.stringify({
                    message: text
                })

            });


        const data =
            await response.json();


        loading.remove();


        if (!response.ok) {

            addMessage(
                "Loi: " +
                (data.error ||
                 "Khong xac dinh"),
                "ai"
            );

            return;
        }


        addMessage(
            data.reply,
            "ai"
        );


    } catch (error) {

        loading.remove();

        addMessage(
            "Khong ket noi duoc toi may chu.",
            "ai"
        );

        console.error(error);

    } finally {

        send.disabled = false;

    }

}


/* NUT GUI */

send.onclick =
    sendMessage;


/* ENTER */

input.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {

            sendMessage();

        }

    }
);

</script>


</body>

</html>
`;


    // ================================
    // SERVER
    // ================================

    const server =
        http.createServer(
            async (req, res) => {

                // Trang web
                if (
                    req.method === "GET" &&
                    req.url === "/"
                ) {

                    res.writeHead(
                        200,
                        {
                            "Content-Type":
                                "text/html; charset=utf-8"
                        }
                    );

                    res.end(html);

                    return;
                }


                // API CHAT
                if (
                    req.method === "POST" &&
                    req.url === "/chat"
                ) {

                    let body = "";


                    req.on(
                        "data",
                        chunk => {

                            body += chunk;

                        }
                    );


                    req.on(
                        "end",
                        async () => {

                            try {

                                const data =
                                    JSON.parse(body);

                                const message =
                                    data.message;


                                if (!message) {

                                    res.writeHead(
                                        400,
                                        {
                                            "Content-Type":
                                                "application/json"
                                        }
                                    );

                                    res.end(
                                        JSON.stringify({
                                            error:
                                                "Thieu tin nhan"
                                        })
                                    );

                                    return;
                                }


                                // GOI OPENAI

                                const response =
                                    await client.responses.create({

                                        model:
                                            "gpt-5.6-luna",

                                        instructions:
                                            "Ban la Mini AI than thien. Tra loi bang tieng Viet, ngan gon, de hieu.",

                                        input:
                                            message

                                    });


                                const answer =
                                    response.output_text;


                                res.writeHead(
                                    200,
                                    {
                                        "Content-Type":
                                            "application/json"
                                    }
                                );


                                res.end(
                                    JSON.stringify({
                                        reply:
                                            answer
                                    })
                                );


                            } catch (error) {

                                console.error(error);


                                res.writeHead(
                                    500,
                                    {
                                        "Content-Type":
                                            "application/json"
                                    }
                                );


                                res.end(
                                    JSON.stringify({

                                        error:
                                            error.message

                                    })
                                );

                            }

                        }
                    );

                    return;
                }


                res.writeHead(404);

                res.end("Not Found");

            }
        );


    // ================================
    // CHAY SERVER
    // ================================

    server.listen(
        PORT,
        () => {

            console.log("");
            console.log(
                "================================"
            );

            console.log(
                "      MINI AI DANG CHAY"
            );

            console.log(
                "================================"
            );

            console.log(
                "Mo Chrome tai:"
            );

            console.log(
                "http://localhost:" + PORT
            );

            console.log("");

        }
    );

});
window.addEventListener('load', function () {
    setTimeout(function () {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('hidden-splash');
        }
    }, 3000);
});
// 1. Yêu cầu Leaflet tự động tìm vị trí hiện tại và phóng to bản đồ tới đó
map.locate({
    setView: true,      // Tự động di chuyển bản đồ đến vị trí tìm được
    maxZoom: 16,        // Mức phóng to tối đa
    enableHighAccuracy: true // Ưu tiên độ chính xác cao (Wi-Fi / GPS)
});

// 2. Xử lý khi lấy được tọa độ thành công
map.on('locationfound', function (e) {
    const radius = Math.round(e.accuracy); // Sai số tính bằng mét
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;

    // Gắn điểm đánh dấu (Marker) tại vị trí của bạn
    L.marker(e.latlng).addTo(map)
        .bindPopup(`Bạn đang ở đây (sai số khoảng ${radius}m)`).openPopup();

    // Vẽ vòng tròn thể hiện phạm vi sai số
    L.circle(e.latlng, radius).addTo(map);

    console.log("Tọa độ hiện tại:", lat, lng);
});

// 3. Xử lý khi bị lỗi hoặc người dùng từ chối cấp quyền
map.on('locationerror', function (e) {
    alert("Không thể lấy vị trí: " + e.message);
});
