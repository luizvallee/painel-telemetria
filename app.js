// ========================================
// CONFIGURAÇÕES MQTT - HIVEMQ
// ========================================

const BROKER_URL = "ws://broker.hivemq.com:8000/mqtt";

// Identificador do projeto.
// Deve ser igual ao utilizado no código do ESP32.
const TOPIC_BASE = "senai/smartcontrol/sc-iot-7f3a";

const TOPIC_RPM = `${TOPIC_BASE}/rpm`;
const TOPIC_STATUS = `${TOPIC_BASE}/status`;
const TOPIC_EVENTO = `${TOPIC_BASE}/evento`;
const TOPIC_COMANDO = `${TOPIC_BASE}/comando`;

// ========================================
// ELEMENTOS HTML
// ========================================

const elementoRPM = document.getElementById("rpm");
const elementoEstado = document.getElementById("estadoMotor");
const elementoConexao = document.getElementById("conexao");

const statusConexao = document.getElementById("statusConexao");
const textoConexao = document.getElementById("textoConexao");

const ultimaAtualizacao = document.getElementById("ultimaAtualizacao");
const mensagemControle = document.getElementById("mensagemControle");

const listaEventos = document.getElementById("listaEventos");

const botaoReset = document.getElementById("botaoReset");
const botaoEmergencia = document.getElementById("botaoEmergencia");

// ========================================
// VARIÁVEIS
// ========================================

let clienteMQTT = null;

const MAX_PONTOS = 20;

// ========================================
// GRÁFICO CHART.JS
// ========================================

const contextoGrafico = document
    .getElementById("graficoTelemetria")
    .getContext("2d");

const grafico = new Chart(contextoGrafico, {

    type: "line",

    data: {
        labels: [],

        datasets: [{
            label: "Velocidade do motor",
            data: [],

            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.12)",

            borderWidth: 3,
            fill: true,
            tension: 0.35,

            pointRadius: 4,
            pointBackgroundColor: "#2563eb"
        }]
    },

    options: {
        responsive: true,
        maintainAspectRatio: false,

        animation: {
            duration: 300
        },

        scales: {
            y: {
                beginAtZero: true,
                min: 0,
                max: 5000,

                title: {
                    display: true,
                    text: "RPM"
                }
            },

            x: {
                title: {
                    display: true,
                    text: "Horário da leitura"
                }
            }
        },

        plugins: {
            legend: {
                display: true
            }
        }
    }
});

// ========================================
// ATUALIZAÇÃO DO GRÁFICO
// ========================================

function atualizarGrafico(rpm) {

    const horario = new Date().toLocaleTimeString("pt-BR");

    grafico.data.labels.push(horario);
    grafico.data.datasets[0].data.push(rpm);

    // Mantém apenas os últimos 20 registros.
    if (grafico.data.labels.length > MAX_PONTOS) {
        grafico.data.labels.shift();
        grafico.data.datasets[0].data.shift();
    }

    grafico.update();
}

// ========================================
// ATUALIZAÇÃO DO RPM
// ========================================

function atualizarRPM(valor) {

    const rpm = Number(valor);

    if (!Number.isFinite(rpm) || rpm < 0 || rpm > 5000) {
        return;
    }

    elementoRPM.textContent = `${Math.round(rpm)} RPM`;

    atualizarGrafico(rpm);

    ultimaAtualizacao.textContent =
        `Última atualização: ${new Date().toLocaleTimeString("pt-BR")}`;
}

// ========================================
// ATUALIZAÇÃO DO STATUS DO MOTOR
// ========================================

function atualizarStatus(valor) {

    if (valor === "1") {

        elementoEstado.textContent = "LIGADO";
        elementoEstado.style.color = "#16a34a";

    } else if (valor === "0") {

        elementoEstado.textContent = "PARADO";
        elementoEstado.style.color = "#dc2626";

    }
}

// ========================================
// STATUS DA CONEXÃO
// ========================================

function atualizarConexao(conectado) {

    if (conectado) {

        statusConexao.classList.add("conectado");
        statusConexao.classList.remove("desconectado");

        textoConexao.textContent = "Sistema online";
        elementoConexao.textContent = "Online";

    } else {

        statusConexao.classList.remove("conectado");
        statusConexao.classList.add("desconectado");

        textoConexao.textContent = "Sistema offline";
        elementoConexao.textContent = "Offline";

    }
}

// ========================================
// HISTÓRICO DE EVENTOS
// ========================================

function adicionarEvento(mensagem) {

    if (
        listaEventos.children.length === 1 &&
        listaEventos.textContent.includes("Nenhum evento")
    ) {
        listaEventos.innerHTML = "";
    }

    const evento = document.createElement("div");

    evento.className = "evento";

    const horario = new Date().toLocaleTimeString("pt-BR");

    const horarioElemento = document.createElement("strong");
    horarioElemento.textContent = `[${horario}] `;

    evento.appendChild(horarioElemento);
    evento.appendChild(document.createTextNode(mensagem));

    listaEventos.prepend(evento);

    // Limita o histórico a 15 eventos.
    while (listaEventos.children.length > 15) {
        listaEventos.removeChild(listaEventos.lastChild);
    }
}

// ========================================
// CONEXÃO COM HIVEMQ
// ========================================

function conectarMQTT() {

    if (typeof mqtt === "undefined") {
        mensagemControle.textContent =
            "Não foi possível carregar a biblioteca MQTT.js.";
        return;
    }

    const clientId =
        "smartcontrol-web-" +
        Math.random().toString(16).substring(2, 10);

    clienteMQTT = mqtt.connect(BROKER_URL, {
        clientId: clientId,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 3000
    });

    // Quando conectar.
    clienteMQTT.on("connect", function () {

        console.log("Conectado ao HiveMQ!");

        atualizarConexao(true);

        mensagemControle.textContent =
            "Conexão MQTT estabelecida com sucesso.";

        adicionarEvento("Conexão estabelecida com o HiveMQ.");

        // Inscrição nos tópicos.
        clienteMQTT.subscribe([
            TOPIC_RPM,
            TOPIC_STATUS,
            TOPIC_EVENTO
        ], function (erro) {

            if (erro) {
                console.error("Erro ao assinar tópicos:", erro);
                adicionarEvento("Falha ao assinar os tópicos MQTT.");
            } else {
                console.log("Inscrição nos tópicos realizada.");
            }

        });

    });

    // Quando receber uma mensagem.
    clienteMQTT.on("message", function (topico, mensagem) {

        const valor = mensagem.toString();

        console.log("Mensagem recebida:", topico, valor);

        if (topico === TOPIC_RPM) {

            atualizarRPM(valor);

        }

        else if (topico === TOPIC_STATUS) {

            atualizarStatus(valor);

        }

        else if (topico === TOPIC_EVENTO) {

            adicionarEvento(valor);

        }

    });

    // Quando perder a conexão.
    clienteMQTT.on("offline", function () {

        atualizarConexao(false);

        mensagemControle.textContent =
            "Conexão perdida. Tentando reconectar...";

    });

    clienteMQTT.on("reconnect", function () {

        console.log("Tentando reconectar ao HiveMQ...");

    });

    clienteMQTT.on("error", function (erro) {

        console.error("Erro MQTT:", erro);

    });

}

// ========================================
// ENVIO DE COMANDOS
// ========================================

function enviarComando(comando) {

    if (!clienteMQTT || !clienteMQTT.connected) {

        mensagemControle.textContent =
            "Não foi possível enviar: MQTT desconectado.";

        return;

    }

    clienteMQTT.publish(
        TOPIC_COMANDO,
        comando,
        { qos: 0 },
        function (erro) {

            if (erro) {

                mensagemControle.textContent =
                    "Erro ao enviar o comando.";

            } else {

                console.log("Comando enviado:", comando);

                if (comando === "STOP") {

                    mensagemControle.textContent =
                        "Comando de parada enviado ao ESP32.";

                }

                if (comando === "RESET") {

                    mensagemControle.textContent =
                        "Solicitação de reinicialização enviada ao ESP32.";

                }

            }

        }
    );

}

// ========================================
// BOTÃO DE EMERGÊNCIA
// ========================================

botaoEmergencia.addEventListener("click", function () {

    enviarComando("STOP");

});

// ========================================
// BOTÃO DE REINICIALIZAÇÃO
// ========================================

botaoReset.addEventListener("click", function () {

    enviarComando("RESET");

});

// ========================================
// INICIALIZAÇÃO
// ========================================

conectarMQTT();