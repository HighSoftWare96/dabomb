const API_URL = 'http://localhost:3001';
const SOCKETIO_ROOMID = process.argv[2] || '30839b9f-a79b-4981-88ef-f494d1d2ebef';
const JWT = process.argv[3] || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwibmFtZSI6ImdpbyIsImF2YXRhclNlZWQiOiIwMC4wMC4wMCIsInVwZGF0ZWRBdCI6IjIwMjAtMDQtMjZUMTk6MjA6MDkuNzQ2WiIsImNyZWF0ZWRBdCI6IjIwMjAtMDQtMjZUMTk6MjA6MDkuNzQ2WiIsInNvY2tldElkIjpudWxsLCJpYXQiOjE1ODc5Mjg4MDksIm5iZiI6MTU4NzkyODgwOSwiZXhwIjoxNTg4MDE1MjA5LCJhdWQiOiJERVZfZGFib21iOmF1dGhlbnRpY2F0aW9uIiwiaXNzIjoicGFydGVjaXBhbnQuc2VydmljZSIsImp0aSI6ImQzZjM0MmMxLTExNTEtNDc4ZC1hZTJmLWIwZjAzNDA4NmRkZiJ9.mj441V_odchU9lWQvRxMmZrtAcW5ez4FkKuhwy7sHq8';
const NAMESPACE = 'multiplayer';

const
  io = require('socket.io-client'),
  ioClient = io.connect(API_URL + '/' + NAMESPACE, {
    transports: ['websocket', 'polling'],
    query: {
      socketioRoom: SOCKETIO_ROOMID,
      accessToken: JWT
    }
  });

ioClient.on('connect', () => {
  console.log('Client connected');
});

ioClient.on('room-joined', (payload) => {
  console.log('⛺️Joined room!', payload);
});

ioClient.on('new-roomate', (payload) => {
  console.log('🙇🏻‍♂️New partecipant!', payload);
});

ioClient.on('game-started', (payload) => {
  console.log('Gioco partito!', payload);
});

ioClient.on('game-ended', (payload) => {
  console.log('Gioco finito!', payload);
});

ioClient.on('round-started', (payload) => {
  console.log('Round partito!', payload);
  ioClient.emit('turn-check', {
    partecipantId: 1,
    roundId: payload.round.id,
    response: 'aereo'
  });
});

ioClient.on('turn-checked', (payload) => {
  console.log('Check ok. NEXT.', payload);
});

ioClient.on('turn-wrong', (error) => {
  console.log('Turno errato', error);
});

ioClient.on('round-ended', (payload) => {
  console.log('Round finito!', payload);
});

ioClient.on('error', (error) => {
  console.log('System error', error);
});

ioClient.on('client-error', (error) => {
  console.log('Client error', error);
});

ioClient.on('server-error', (error) => {
  console.log('Server error', error);
});

ioClient.on('disconnect', () => {
  console.log('Client disconnected');
});
