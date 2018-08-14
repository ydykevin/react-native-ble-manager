import React, { Component } from 'react';
import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  NativeAppEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
  PermissionsAndroid,
  ListView,
  ScrollView,
  AppState,
  Dimensions,
} from 'react-native';
import BleManager from 'react-native-ble-manager';
import { Buffer } from 'buffer';
import AES from 'crypto-js/aes';
import ECB from 'crypto-js/mode-ecb';
import NoPadding from 'crypto-js/pad-nopadding';
import Hex from 'crypto-js/enc-hex';
import Utf8 from 'crypto-js/enc-utf8';
import Base64 from 'crypto-js/enc-base64';

const window = Dimensions.get('window');
const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const UUID_BASE = (x) => `0000${x}-0000-3512-2118-0009AF100700`;
const miband2_service = 'FEE1';
const act      = UUID_BASE('0004');
const act_data = UUID_BASE('0005');
const auth     = UUID_BASE('0009');

export default class App extends Component {
  constructor(){
    super()

    this.state = {
      scanning:false,
      peripherals: new Map(),
      appState: ''
    }

    this.handleDiscoverPeripheral = this.handleDiscoverPeripheral.bind(this);
    this.handleStopScan = this.handleStopScan.bind(this);
    this.handleUpdateValueForCharacteristic = this.handleUpdateValueForCharacteristic.bind(this);
    this.handleDisconnectedPeripheral = this.handleDisconnectedPeripheral.bind(this);
    this.handleAppStateChange = this.handleAppStateChange.bind(this);

    this.key = [0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
  }

  componentDidMount() {
    AppState.addEventListener('change', this.handleAppStateChange);

    BleManager.start({showAlert: false});

    this.handlerDiscover = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', this.handleDiscoverPeripheral );
    this.handlerStop = bleManagerEmitter.addListener('BleManagerStopScan', this.handleStopScan );
    this.handlerDisconnect = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDisconnectedPeripheral );
    this.handlerUpdate = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', this.handleUpdateValueForCharacteristic );



    if (Platform.OS === 'android' && Platform.Version >= 23) {
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
            if (result) {
              console.log("Permission is OK");
            } else {
              PermissionsAndroid.requestPermission(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
                if (result) {
                  console.log("User accept");
                } else {
                  console.log("User refuse");
                }
              });
            }
      });
    }

  }

  handleAppStateChange(nextAppState) {
    if (this.state.appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App has come to the foreground!')
      BleManager.getConnectedPeripherals([]).then((peripheralsArray) => {
        console.log('Connected peripherals: ' + peripheralsArray.length);
      });
    }
    this.setState({appState: nextAppState});
  }

  componentWillUnmount() {
    this.handlerDiscover.remove();
    this.handlerStop.remove();
    this.handlerDisconnect.remove();
    this.handlerUpdate.remove();
  }

  handleDisconnectedPeripheral(data) {
    let peripherals = this.state.peripherals;
    let peripheral = peripherals.get(data.peripheral);
    if (peripheral) {
      peripheral.connected = false;
      peripherals.set(peripheral.id, peripheral);
      this.setState({peripherals});
    }
    console.log('Disconnected from ' + data.peripheral);
  }

  handleUpdateValueForCharacteristic(data) {
    console.log('Data Update at: ' + data.peripheral + ' characteristic: ' + data.characteristic + ' data: '+ data.value);
    //var cipher = [0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01,0x01];
    //var encryptedtext = AES.encrypt('aaaaaaaaaaaaaaaa', '1234567890123456',{mode: ECB},{padding: NoPadding}).toString();
    //var encryptedtext = AES.encrypt(cipher, this.key,{mode: ECB},{padding: NoPadding}).toString();
    //var encryptedtext = AES.encrypt(data.value.substring(2,16),this.key,{mode: ECB},{padding: NoPadding});
    //var cmd = Buffer.from(data.value).toString('hex');
    //console.log('hex cmd: '+cmd);
    //Authentication
    if(data.characteristic === auth){
      var cmd = Buffer.from(data.value).slice(0,3).toString('hex');
      var peripheral = this.state.peripherals.get(data.peripheral);
      if (cmd === '100101') {         
        console.log('Set New Key OK');
        this.send(peripheral,miband2_service,auth,[0x02,0x08]);
      } else if (cmd === '100201') {
        console.log('Req Random Number OK');
        // var cipher = data.value.slice(3).toString;
        // console.log('cipher2: '+cipher);
        // var encryptedtext = AES.encrypt(
        //   Utf8.parse(cipher),
        //   Hex.parse('30313233343536373839404142434445'),
        //   {mode: ECB,padding: NoPadding}
        // ).toString();
        // console.log('encrypt: '+encryptedtext);

        // var service = 'FEE1';
        // var characteristic = '00000009-0000-3512-2118-0009AF100700';
        // var e64 = Base64.parse(encryptedtext);
        // var eHex = e64.toString(Hex);
        // var string = '38'.concat(eHex).split('');
        // console.log(string);
        // console.log(data.peripheral);

        
        // this.send(peripheral,service,characteristic,string);
      } else if (cmd === '100301') {
        console.log('Authenticated');
      } else if (cmd === '100104') {
        console.log('Set New Key FAIL');
      } else if (cmd === '100204') {
        console.log('Req Random Number FAIL')
      } else if (cmd === '100304') {
        console.log('Encryption Key Auth Fail, should send new key...')
        //this.authSendNewKey(this.key)
      }
    } else {
      var cmd = Buffer.from(data.value).toString('hex');
      console.log('not auth: '+ cmd);
    }
  
  }

  handleStopScan() {
    console.log('Scan is stopped');
    this.setState({ scanning: false });
  }

  startScan() {
    if (!this.state.scanning) {
      this.setState({peripherals: new Map()});
      BleManager.scan([], 3, true).then((results) => {
        console.log('Scanning...');
        this.setState({scanning:true});
      });
    }
  }

  retrieveConnected(){
    BleManager.getConnectedPeripherals([]).then((results) => {
      console.log(results);
      var peripherals = this.state.peripherals;
      for (var i = 0; i < results.length; i++) {
        var peripheral = results[i];
        peripheral.connected = true;
        peripherals.set(peripheral.id, peripheral);
        this.setState({ peripherals });
      }
    });
  }

  handleDiscoverPeripheral(peripheral){
    var peripherals = this.state.peripherals;
    if (!peripherals.has(peripheral.id)){
      console.log('Got ble peripheral', peripheral);
      peripherals.set(peripheral.id, peripheral);
      this.setState({ peripherals })
    }
  }

  send(peripheral,service,characteristic,string){
    setTimeout(() => {
      BleManager.retrieveServices(peripheral.id).then((peripheralInfo) => {
        setTimeout(() => {
          BleManager.startNotification(peripheral.id, service, characteristic).then(() => {
            console.log('Started notification on ' + peripheral.id);
            BleManager.writeWithoutResponse(peripheral.id, service, characteristic, string).then(() => {
              console.log('writing'+string);
            }).catch((error)=>{
              console.log('Second write error', error);
            });
          }).catch((error) => {
            console.log('Notification error', error);
          });
        }, 200);
      });
    },900);
  }

  test(peripheral) {
    if (peripheral){
      if (peripheral.connected){
        BleManager.disconnect(peripheral.id);
      }else{
        BleManager.connect(peripheral.id).then(() => {
          let peripherals = this.state.peripherals;
          let p = peripherals.get(peripheral.id);
          if (p) {
            p.connected = true;
            peripherals.set(peripheral.id, p);
            this.setState({peripherals});
          }
          console.log('Connected to ' + peripheral.id);


          //var service = 'FEE1';
          //var characteristic = '00000009-0000-3512-2118-0009af100700';
          // var str = '28';
          // var string = str.split('');
          var string = [0x01,0x08,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
          this.send(peripheral,miband2_service,auth,string);
          // setTimeout(() => {

          //   /* Test read current RSSI value
          //   BleManager.retrieveServices(peripheral.id).then((peripheralData) => {
          //     console.log('Retrieved peripheral services', peripheralData);

          //     BleManager.readRSSI(peripheral.id).then((rssi) => {
          //       console.log('Retrieved actual RSSI value', rssi);
          //     });
          //   });*/

          //   // Test using bleno's pizza example
          //   // https://github.com/sandeepmistry/bleno/tree/master/examples/pizza
          //   BleManager.retrieveServices(peripheral.id).then((peripheralInfo) => {
          //     console.log(peripheralInfo);
          //     //var service = '0000fee1-0000-1000-8000-00805f9b34fb';
          //     var service = 'FEE1';
          //     var authCharacteristic = '00000009-0000-3512-2118-0009af100700';
          //     //var oe = new Buffer([0x01,0x08]);
          //     //console.log(oe);
          //     console.log('---');
          //     //var key = new Buffer('30313233343536373839404142434445', 'hex');
          //     //var oek = Buffer.concat([oe,key]);
          //     var oek = [0x01,0x08,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
          //     //const oek = new Buffer('010830313233343536373839404142434445', 'hex');
          //     console.log(oek);
          //     console.log('---');
          //     //var te = new Buffer([0x02,0x08]);
          //     var te = [0x02,0x08];
          //     console.log(te);
          //     setTimeout(() => {
          //       BleManager.startNotification(peripheral.id, service, authCharacteristic).then(() => {
          //         console.log('Started notification on ' + peripheral.id);
          //         //var hex = new Buffer(oek, "base64").toString('hex');
          //         // BleManager.writeWithoutResponse(peripheral.id, service, authCharacteristic, oek).then(() => {
          //         // }).catch((error)=>{
          //         //   console.log('First write error', error);
          //         // });
          //         //hex = new Buffer(te, "base64").toString('hex'); 
          //         BleManager.writeWithoutResponse(peripheral.id, service, authCharacteristic, te).then(() => {
          //         }).catch((error)=>{
          //           console.log('Second write error', error);
          //         });
          //       }).catch((error) => {
          //         console.log('Notification error', error);
          //       });
          //     }, 200);
          //   });

          // }, 900);
        }).catch((error) => {
          console.log('Connection error', error);
        });
      }
    }
  }

  render() {
    const list = Array.from(this.state.peripherals.values());
    const dataSource = ds.cloneWithRows(list);


    return (
      <View style={styles.container}>
        <TouchableHighlight style={{marginTop: 40,margin: 20, padding:20, backgroundColor:'#ccc'}} onPress={() => this.startScan() }>
          <Text>Scan Bluetooth ({this.state.scanning ? 'on' : 'off'})</Text>
        </TouchableHighlight>
        <TouchableHighlight style={{marginTop: 0,margin: 20, padding:20, backgroundColor:'#ccc'}} onPress={() => this.retrieveConnected() }>
          <Text>Retrieve connected peripherals</Text>
        </TouchableHighlight>
        <ScrollView style={styles.scroll}>
          {(list.length == 0) &&
            <View style={{flex:1, margin: 20}}>
              <Text style={{textAlign: 'center'}}>No peripherals</Text>
            </View>
          }
          <ListView
            enableEmptySections={true}
            dataSource={dataSource}
            renderRow={(item) => {
              const color = item.connected ? 'green' : '#fff';
              return (
                <TouchableHighlight onPress={() => this.test(item) }>
                  <View style={[styles.row, {backgroundColor: color}]}>
                    <Text style={{fontSize: 12, textAlign: 'center', color: '#333333', padding: 10}}>{item.name}</Text>
                    <Text style={{fontSize: 8, textAlign: 'center', color: '#333333', padding: 10}}>{item.id}</Text>
                  </View>
                </TouchableHighlight>
              );
            }}
          />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    width: window.width,
    height: window.height
  },
  scroll: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    margin: 10,
  },
  row: {
    margin: 10
  },
});
