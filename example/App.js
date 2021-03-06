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
import crypto from 'react-native-crypto';

const window = Dimensions.get('window');
const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

const UUID_BASE = (x) => `0000${x}-0000-3512-2118-0009AF100700`;
const miband2_service    = 'FEE1';
const miband_service     = 'FEE0';
const deviceInfo_service = '180A';
const act      = UUID_BASE('0004');
const act_data = UUID_BASE('0005');
const batt     = UUID_BASE('0006');
const auth     = UUID_BASE('0009');

const AB = function() {
  var args = [...arguments];
  
  // Convert all arrays to buffers
  args = args.map(function(i) {
    if (i instanceof Array) {
      return Buffer.from(i);
    }
    return i;
  })
  
  // Merge into a single buffer
  var buf = Buffer.concat(args);

  // Convert into ArrayBuffer
  var ab = new ArrayBuffer(buf.length);
  var view = new Array(ab);

  for (var i = 0; i < buf.length; ++i) {
    view[i] = buf[i];
  }

  console.log('view: '+view+' length: '+view.length);
  return view;
}

export default class App extends Component {
  constructor(){
    super()

    this.state = {
      scanning:false,
      peripherals: new Map(),
      appState: '',
      lastSyncMin: new Date(),
    }

    this.handleDiscoverPeripheral = this.handleDiscoverPeripheral.bind(this);
    this.handleStopScan = this.handleStopScan.bind(this);
    this.handleUpdateValueForCharacteristic = this.handleUpdateValueForCharacteristic.bind(this);
    this.handleDisconnectedPeripheral = this.handleDisconnectedPeripheral.bind(this);
    this.handleAppStateChange = this.handleAppStateChange.bind(this);

    this.key = [0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
    this.tableData = [];
    this.tableData.push(['Time','Kind','Intensity','Step','Heart Rate']);
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
    
    //Authentication
    if(data.characteristic.toUpperCase() === auth){
      var cmd = Buffer.from(data.value).slice(0,3).toString('hex');
      var peripheral = this.state.peripherals.get(data.peripheral);
      if (cmd === '100101') {         
        console.log('Set New Key OK');
        //this.sendWithoutNotification(peripheral,miband2_service,auth,[0x02,0x08]);
        BleManager.writeWithoutResponse(peripheral.id,miband2_service,auth,[0x02,0x08]);
      } else if (cmd === '100201') {
        console.log('Req Random Number OK');

        var rdn = Buffer.from(data.value).slice(3,19);
        console.log('random number: '+ rdn);
        var cipher = crypto.createCipheriv('aes-128-ecb', this.key, '').setAutoPadding(false);
        var encrypted = Buffer.concat([cipher.update(rdn), cipher.final()]);
        console.log('encrypted: '+encrypted+' length: '+encrypted.length);

        //this.sendWithoutNotification(peripheral,miband2_service,auth,AB([0x03,0x08],encrypted));
        BleManager.writeWithoutResponse(peripheral.id,miband2_service,auth,AB([0x03,0x08],encrypted));
      } else if (cmd === '100301') {
        console.log('Authenticated');
        
        //BleManager.startNotification(peripheral.id,miband_service,batt).then(()=>{
          //setTimeout(()=>{
            BleManager.read(peripheral.id,miband_service,batt).then((data)=>{
              var battery = data[1];
              console.log('battery inside: '+battery);

              var head = [0x01,0x01];
              var tail = [0x00,0x28]; // timezone * 4, Sydney = 10 * 4

              var time    = new Date();
              var year    = time.getFullYear();
              var month   = time.getMonth() + 1;
              var date    = time.getDate();
              //var hour    = time.getHours();
              //var minute  = time.getMinutes();
              var hour    = 20;
              var minute  = 10;
              time.setHours(hour);
              time.setMinutes(minute);
              this.setState({lastSyncMin:time});
              console.log('time: '+time+' year: '+year+' month: '+month+' date: '+date+' hour: '+hour+' minute: '+minute);

              var yearByte = [ year & 0xff, (year >> 8) & 0xff];
              
              var arr = AB(head,yearByte,[month],[date],[hour],[minute],tail);
              console.log('arr: '+arr);

              //this.send(peripheral,miband_service,act,arr);
              
              setTimeout(()=>{
                BleManager.retrieveServices(peripheral.id).then(() => {
                  setTimeout(()=>{
                    BleManager.startNotification(peripheral.id, miband_service, act);//.then(() => {
                      setTimeout(()=>{
                        BleManager.writeWithoutResponse(peripheral.id, miband_service, act, arr).then(() => {
                          setTimeout(()=>{
                            BleManager.retrieveServices(peripheral.id).then(() => {
                              setTimeout(()=>{
                                BleManager.startNotification(peripheral.id,miband_service,act_data);//.then(()=>{
                                  setTimeout(() => {
                                    BleManager.writeWithoutResponse(peripheral.id,miband_service,act,[0x02]);
                                  },500);
                                //});
                              },200);
                            });
                          },900);
                        });
                      },500,arr);
                    //},arr);
                  },200,arr);
                },arr);
              },900,arr);
            });
          //},500);
        //});
      } else if (cmd === '100104') {
        console.log('Set New Key FAIL');
      } else if (cmd === '100204') {
        console.log('Req Random Number FAIL')
      } else if (cmd === '100304') {
        console.log('Encryption Key Auth Fail, should send new key...')
        //this.authSendNewKey(this.key)
      }
    } else if (data.characteristic.toUpperCase() === act_data){

      for(var i = 1; i < data.value.length; i+=4){
        var kind      = data.value[i] & 0xff;
        var intensity = data.value[i+1] & 0xff;
        var step      = data.value[i+2] & 0xff;
        var heartRate = data.value[i+3] & 0xff;
        console.log('Kind: '+ kind +' Intensity: '+ intensity +' Step: '+ step +' Heart Rate: '+ heartRate);
        var time    = this.state.lastSyncMin;
        var year    = time.getFullYear();
        var month   = (time.getMonth()+1)<10?'0'+(time.getMonth()+1):(time.getMonth()+1);
        var date    = time.getDate()<10?'0'+time.getDate():time.getDate();
        var hour    = time.getHours()<10?'0'+time.getHours():time.getHours();
        var minute  = time.getMinutes()<10?'0'+time.getMinutes():time.getMinutes();
        var timeToPrint = date + '/' + month + '/' + year + ' ' + hour + ':' + minute; 
        //this.tableData.push([timeToPrint,kind,intensity,step,heartRate]);
        this.tableData.push([timeToPrint,kind,intensity,step]);
        var newLastSyncMin = new Date(this.state.lastSyncMin.getTime() + 60 * 1000);
        this.setState({lastSyncMin:newLastSyncMin});
      }
      this.forceUpdate();
    }
  
  }

  handleStopScan() {
    console.log('Scan is stopped');
    this.setState({ scanning: false });
  }

  startScan() {
    this.tableData = [['Time','Kind','Intensity','Step']];
    this.forceUpdate();
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

  // beginNotification(peripheral,service,characteristic){
  //   setTimeout(() => {
  //     BleManager.startNotification(peripheral.id, service, characteristic).then(() => {

  //     }).catch((error) => {
  //       console.log('Notification error', error);
  //     });
  //   }, 700);
  // }

  // send(peripheral,service,characteristic,data){
  //   setTimeout(() => {
  //     BleManager.retrieveServices(peripheral.id).then((peripheralInfo) => {
  //       setTimeout(() => {
  //         BleManager.startNotification(peripheral.id, service, characteristic).then(() => {
  //           console.log('Started notification on ' + peripheral.id);
  //           //setTimeout(() => {
  //             BleManager.writeWithoutResponse(peripheral.id, service, characteristic, data).then(() => {
  //               console.log('writing: '+data);
  //             }).catch((error)=>{
  //               console.log('Writing error', error);
  //             });
  //           //},5000);
  //         }).catch((error) => {
  //           console.log('Notification error', error);
  //         });
  //       }, 700);
  //     });
  //   },1200);
  // }

  // sendWithoutNotification(peripheral,service,characteristic,data){
  //   //setTimeout(() => {
  //     BleManager.retrieveServices(peripheral.id).then((peripheralInfo) => {
  //       //setTimeout(() => {
  //         BleManager.writeWithoutResponse(peripheral.id, service, characteristic, data).then(() => {
  //           console.log('writing: '+data);
  //         }).catch((error)=>{
  //           console.log('Writing error', error);
  //         });
  //       //},700);
  //     });
  //   //},1000);
  // }

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

          //this.send(peripheral,miband2_service,auth,data);

          setTimeout(() => {
            BleManager.retrieveServices(peripheral.id).then(() => {
              setTimeout(() => {
                BleManager.startNotification(peripheral.id, miband2_service, auth);//.then(() => {
                  console.log('Started notification on ' + peripheral.id);
                  setTimeout(() => {
                    var data = [0x01,0x08,0x30,0x31,0x32,0x33,0x34,0x35,0x36,0x37,0x38,0x39,0x40,0x41,0x42,0x43,0x44,0x45];
                    BleManager.writeWithoutResponse(peripheral.id, miband2_service, auth, data).then(() => {
                      console.log('writing: '+data);
                    }).catch((error)=>{
                      console.log('Writing error', error);
                    });
                  },500);
                // }).catch((error) => {
                //   console.log('Notification error', error);
                // });
              }, 200);
            });
          },900);

        }).catch((error) => {
          console.log('Connection error', error);
        });
      }
    }
  }

  render() {
    const list = Array.from(this.state.peripherals.values());
    const dataSource = ds.cloneWithRows(list);
    const arr = Array.from([1,2,3,4,5,6,7,8,9,0]);
    const dataList = ds.cloneWithRows(arr);

    

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
        <ScrollView style={styles.scroll}>
          <ScrollView  horizontal = {true} showsHorizontalScrollIndicator= {false}>
                <View>
                  {
                    this.tableData.map((eachRow,j) => {
                          return (
                            <View style={{flexDirection:'row'}} key = {j}>
                                {
                                  eachRow.map((eachItem,i) => {
                                    return <View key = {i} style={{width:i==0?150:70,height:40,backgroundColor:((j%2)?'white':'#ccc'),alignItems:'center',justifyContent:'center'}}><Text>{eachItem}</Text></View>
                                  })
                                }
                            </View>
                          );
                      })
                  }
                </View>
            </ScrollView>
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
