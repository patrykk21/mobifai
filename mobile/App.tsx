import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ConnectScreen from './src/screens/ConnectScreen';
import TerminalScreen from './src/screens/TerminalScreen';

export type RootStackParamList = {
  Connect: undefined;
  Terminal: { relayServerUrl: string; pairingCode: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <Stack.Navigator
        initialRouteName="Connect"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#000',
          },
          headerTintColor: '#0f0',
          headerTitleStyle: {
            fontFamily: 'monospace',
          },
        }}
      >
        <Stack.Screen
          name="Connect"
          component={ConnectScreen}
          options={{ title: 'MobiFai - Connect' }}
        />
        <Stack.Screen
          name="Terminal"
          component={TerminalScreen}
          options={{ title: 'Terminal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
