#include <MFRC522v2.h>
#include <MFRC522DriverSPI.h>
#include <MFRC522DriverPinSimple.h>
#include <IRremote.hpp>

//针脚设置

#define RFID_SS 33
#define IR_PIN 21

//RFID设置

MFRC522DriverPinSimple ss_pin(RFID_SS);
MFRC522DriverSPI driver{ss_pin};
MFRC522 mfrc522{driver};

//IR设置

uint16_t lastCommand = 0;

unsigned long holdStart = 0;
unsigned long lastIRTime = 0;


const unsigned long HOLD_TIMEOUT = 250;



void setup() {

  Serial.begin(115200);

  mfrc522.PCD_Init();

  IrReceiver.begin(
    IR_PIN,
    DISABLE_LED_FEEDBACK
  );
}

//光标指令输出

void moveCursor(uint16_t command, int steps) {

  const char* action = nullptr;

//定义输入指令名称
  switch (command) {

    case 0x18:
      action = "CURSOR_LEFT";
      break;

    case 0x5A:
      action = "CURSOR_UP";
      break;

    case 0x08:
      action = "CURSOR_DOWN";
      break;

    case 0x52:
      action = "CURSOR_RIGHT";
      break;

    default:
      return;
  }


  for (int i = 0; i < steps; i++) {
    Serial.println(action);
  }
}

//IR控制

void checkIR() {

  if (!IrReceiver.decode()) {
    return;
  }

  unsigned long now = millis();

  if (IrReceiver.decodedIRData.protocol == NEC) {

    uint16_t command =
      IrReceiver.decodedIRData.command;

    bool isRepeat =
      IrReceiver.decodedIRData.flags &
      IRDATA_FLAGS_IS_REPEAT;

    //按住加速
    if (isRepeat) {

      if (
        lastCommand != 0 &&
        now - lastIRTime < HOLD_TIMEOUT
      ) {

        unsigned long holdTime =
          now - holdStart;

        int steps = 1;

        if (holdTime >= 1000) {
          steps = 4;
        }
        else if (holdTime >= 400) {
          steps = 2;
        }

        moveCursor(lastCommand, steps);

        lastIRTime = now;
      }
    }

    else {

      lastCommand = command;
      holdStart = now;
      lastIRTime = now;

      switch (command) {

        // 光标移动
        case 0x18:
        case 0x5A:
        case 0x08:
        case 0x52:
          moveCursor(command, 1);
          break;

        // 输入战备指令

        case 0x46:
          Serial.println("CODE_LEFT");
          break;

        case 0x43:
          Serial.println("CODE_UP");
          break;

        case 0x44:
          Serial.println("CODE_DOWN");
          break;

        case 0x15:
          Serial.println("CODE_RIGHT");
          break;

        default:
          break;
      }
    }
  }

  IrReceiver.resume();
}


void loop() {

  checkIR();
  if (!mfrc522.PICC_IsNewCardPresent()) {
    return;
  }

  if (!mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  //战备投送
  Serial.println("DEPLOY");
  mfrc522.PICC_HaltA();
}
