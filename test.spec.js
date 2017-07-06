/* global describe, it */
/* ഓം ബ്രഹ്മാർപ്പണം. */

/*
 * test.spec.js
 * Created: Thu Jul 06 2017 09:03:15 GMT+0530 (IST)
 * Copyright 2017 Harish.K<harish2704@gmail.com>
 */

require('simple-mocha');
const cluster = require('cluster');
const assert = require('assert');
const Mutex = require('./src/mutex');

const THREAD_COUNT = 4;

const logsWithoutMutex = [];
const logsWithMutex = [];


function masterTask(){
  let i=0,
      worker,
      done;

  function messageHandler( msg ){
    if( msg.isWithMutex === false ){
      logsWithoutMutex.push( msg.data );
    } else if( msg.isWithMutex === true ){
      logsWithMutex.push( msg.data );
    }

    if( logsWithMutex.length === THREAD_COUNT*2 ){
      done();
    }
  }
  while( i< THREAD_COUNT ){
    worker = cluster.fork();
    i++;
    worker.on('message', messageHandler );
  }
  Mutex.init();
  return new Promise( function(resolve){
    done = resolve;
  });
}

function sendMsg( isWithMutex, data ){
  process.send({ isWithMutex, data });
}

function delay( ms ){
  return new Promise(function(resolve){
    setTimeout( resolve, ms );
  });
}

function asyncWithoutLock(){

  sendMsg( false, ['connect', process.pid ] );
  return delay(500)
  .then( () => sendMsg( false, ['disconnect', process.pid ] ) );
}

function asyncWithLock(){
  let mutex;
  return Mutex.acquire()
  .then( function( _mutex ){
    mutex = _mutex;
    sendMsg( true, ['connect', process.pid ] );
    return delay(500);
  })
  .then( function(){
    mutex.release();
    sendMsg( true, ['disconnect', process.pid ] );
  });
}

function slaveTask(){
  Promise.all([
    asyncWithLock(),
    asyncWithoutLock()
  ])
  .then( ()=> process.exit(0) );
}

function test(){
  console.log('===== Starting Test =====');
  describe('Mutex', function(){
    describe( 'Async task without mutex lock', function(){
      it( 'should receive concurrent connection requests', function(){
        logsWithoutMutex.slice(0, 4).forEach(function( activiy ){
          assert.equal( activiy[0], 'connect' );
        });
      });
      it( 'should receive concurrent disconnection requests', function(){
        logsWithoutMutex.slice(4).forEach(function( activiy ){
          assert.equal( activiy[0], 'disconnect' );
        });
      });
    });

    describe( 'Async task with mutex lock', function(){
      it( 'should receive connection request after each disconnection request', function(){
        logsWithMutex.filter( (v, i)=> i%2 === 0 ).forEach(function( activiy ){
          assert.equal( activiy[0], 'connect' );
        });
      });
      it( 'should receive disconnection request after each connection request', function(){
        logsWithMutex.filter( (v, i)=> i%2 === 1 ).forEach(function( activiy ){
          assert.equal( activiy[0], 'disconnect' );
        });
      });
    });
  });
}

if (cluster.isMaster) {
  masterTask()
  .then( test );
} else {
  slaveTask();
}

