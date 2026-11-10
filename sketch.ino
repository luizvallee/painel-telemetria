#include <WiFi.h>
#include <PubSubClient.h>

// ========================================
// WIFI
// ========================================

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASS ""

// ========================================
// HIVEMQ
// ========================================

const char* MQTT_SERVER = "broker.hivemq.com";
const int MQTT_PORT = 1883;

// Identificador exclusivo deste projeto.
const char* TOPIC_BASE = "senai/smartcontrol/sc-iot-7f3a";

const char* TOPIC_RPM =
    "senai/smartcontrol/sc-iot-7f3a/rpm";

const char* TOPIC_STATUS =
    "senai/smartcontrol/sc-iot-7f3a/status";

const char* TOPIC_EVENTO =
    "senai/smartcontrol/sc-iot-7f3a/evento";

const char* TOPIC_COMANDO =
    "senai/smartcontrol/sc-iot-7f3a/comando";

// ========================================
// CLIENTES
// ========================================

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

// ========================================
// PINOS
// ========================================

#define POT_PIN 34
#define RELE_PIN 26
#define BOTAO_PIN 19
#define LED_PIN 27

// ========================================
// CONFIGURAÇÕES
// ========================================

const int RPM_MAX = 5000;
const int RPM_LIMITE = 3500;

#define RELE_LIGADO HIGH
#define RELE_DESLIGADO LOW

bool emergencia = false;

bool botaoAnterior = HIGH;
bool estadoBotaoEstavel = HIGH;

unsigned long ultimaMudancaBotao = 0;
unsigned long ultimoEnvio = 0;
unsigned long ultimaTentativaMQTT = 0;

const unsigned long INTERVALO_ENVIO = 2000;
const unsigned long DEBOUNCE = 50;

// ========================================
// CONTROLE DO MOTOR
// ========================================

void atualizarMotor() {

    digitalWrite(
        RELE_PIN,
        emergencia ? RELE_DESLIGADO : RELE_LIGADO
    );

    digitalWrite(
        LED_PIN,
        emergencia ? LOW : HIGH
    );

}

// ========================================
// PUBLICAÇÃO MQTT
// ========================================

void publicarStatus() {

    if (mqtt.connected()) {

        mqtt.publish(
            TOPIC_STATUS,
            emergencia ? "0" : "1"
        );

    }

}

void publicarEvento(const char* mensagem) {

    if (mqtt.connected()) {

        mqtt.publish(
            TOPIC_EVENTO,
            mensagem
        );

    }

    Serial.println(mensagem);

}

// ========================================
// PARADA DE EMERGÊNCIA
// ========================================

void pararMotor(const char* origem) {

    if (emergencia) {
        return;
    }

    emergencia = true;

    atualizarMotor();

    Serial.print("EMERGENCIA: ");
    Serial.println(origem);

    publicarStatus();
    publicarEvento(origem);

}

// ========================================
// REINICIAR MOTOR
// ========================================

void reiniciarMotor(int rpm) {

    if (!emergencia) {

        Serial.println("Motor ja esta ligado.");
        return;

    }

    if (digitalRead(BOTAO_PIN) == LOW ||
        rpm > RPM_LIMITE) {

        Serial.println(
            "Reset bloqueado: condicao insegura!"
        );

        publicarEvento(
            "Reset bloqueado: condicao insegura!"
        );

        return;

    }

    emergencia = false;

    atualizarMotor();

    publicarStatus();

    publicarEvento(
        "Motor reiniciado pelo comando remoto"
    );

}

// ========================================
// RECEBIMENTO DE COMANDOS MQTT
// ========================================

void receberMensagem(
    char* topico,
    byte* payload,
    unsigned int tamanho
) {

    String mensagem = "";

    for (unsigned int i = 0; i < tamanho; i++) {

        mensagem += (char)payload[i];

    }

    mensagem.trim();

    Serial.print("Comando recebido: ");
    Serial.println(mensagem);

    int rpmAtual = map(
        analogRead(POT_PIN),
        0,
        4095,
        0,
        RPM_MAX
    );

    if (mensagem == "STOP") {

        pararMotor(
            "Emergencia acionada pela pagina web"
        );

    }

    else if (mensagem == "RESET") {

        reiniciarMotor(rpmAtual);

    }

}

// ========================================
// CONEXÃO WIFI
// ========================================

void conectarWiFi() {

    WiFi.mode(WIFI_STA);

    WiFi.begin(WIFI_SSID, WIFI_PASS);

    Serial.print("Conectando ao WiFi");

    while (WiFi.status() != WL_CONNECTED) {

        delay(500);

        Serial.print(".");

    }

    Serial.println();

    Serial.println("WiFi conectado!");

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

}

// ========================================
// CONEXÃO MQTT
// ========================================

void conectarMQTT() {

    if (mqtt.connected()) {
        return;
    }

    if (WiFi.status() != WL_CONNECTED) {
        return;
    }

    if (millis() - ultimaTentativaMQTT < 3000) {
        return;
    }

    ultimaTentativaMQTT = millis();

    String clientId =
        "ESP32-SmartControl-" +
        String((uint32_t)ESP.getEfuseMac(), HEX);

    Serial.println("Conectando ao HiveMQ...");

    if (mqtt.connect(clientId.c_str())) {

        Serial.println("MQTT conectado!");

        mqtt.subscribe(TOPIC_COMANDO);

        publicarStatus();

        publicarEvento("Sistema iniciado");

    } else {

        Serial.print("Falha MQTT. Estado: ");
        Serial.println(mqtt.state());

    }

}

// ========================================
// SETUP
// ========================================

void setup() {

    Serial.begin(115200);

    pinMode(POT_PIN, INPUT);
    pinMode(RELE_PIN, OUTPUT);
    pinMode(BOTAO_PIN, INPUT_PULLUP);
    pinMode(LED_PIN, OUTPUT);

    // Inicialização segura.
    emergencia = true;

    atualizarMotor();

    conectarWiFi();

    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setCallback(receberMensagem);

    mqtt.setBufferSize(256);

    Serial.println("SmartControl iniciado!");

}

// ========================================
// LOOP
// ========================================

void loop() {

    // Mantém a comunicação MQTT ativa.
    conectarMQTT();

    if (mqtt.connected()) {
        mqtt.loop();
    }

    // Leitura do potenciômetro.
    int leitura = analogRead(POT_PIN);

    int rpm = map(
        leitura,
        0,
        4095,
        0,
        RPM_MAX
    );

    rpm = constrain(rpm, 0, RPM_MAX);

    // Segurança por limite de RPM.
    if (rpm > RPM_LIMITE) {

        pararMotor("RPM acima do limite");

    }

    // ====================================
    // BOTÃO FÍSICO COM DEBOUNCE
    // ====================================

    bool leituraBotao = digitalRead(BOTAO_PIN);

    if (leituraBotao != botaoAnterior) {

        ultimaMudancaBotao = millis();

        botaoAnterior = leituraBotao;

    }

    if (millis() - ultimaMudancaBotao >= DEBOUNCE) {

        if (leituraBotao != estadoBotaoEstavel) {

            estadoBotaoEstavel = leituraBotao;

            if (estadoBotaoEstavel == LOW) {

                pararMotor(
                    "Emergencia acionada fisicamente"
                );

            }

        }

    }

    // ====================================
    // ENVIO DE TELEMETRIA
    // ====================================

    if (millis() - ultimoEnvio >= INTERVALO_ENVIO) {

        ultimoEnvio = millis();

        Serial.print("RPM: ");
        Serial.println(rpm);

        Serial.print("Motor: ");
        Serial.println(
            emergencia ? "PARADO" : "LIGADO"
        );

        if (mqtt.connected()) {

            char valorRPM[10];

            snprintf(
                valorRPM,
                sizeof(valorRPM),
                "%d",
                rpm
            );

            mqtt.publish(
                TOPIC_RPM,
                valorRPM
            );

            publicarStatus();

        }

    }

}