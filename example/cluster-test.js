const cluster = require('cluster');
const numCPUs = parseInt( process.env.THREAD_COUNT || require('os').cpus().length );
const Mutex = require('../');
// const Mutex = require('standalone-mutex');
const log = console.log.bind( console, 'Info: ');

const MID = 'asdf65498'; // A unique id for indentifying our mutex.




function delay( ms ){
  return new Promise(function(resolve){
    setTimeout( resolve, ms );
  });
}



function doAsync( pid ){
  let mutex;
  return Mutex.acquire( MID )
  .then(function( m ){
    mutex = m;
    log('doAsync:start ' + pid );
    return delay(2000);
  })
  .then(function(){
    log('doAsync:done ' + pid );
    return mutex.release();
  });
}



function master(){
  log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  Mutex.init();

  doAsync( process.pid ).catch( log );

  cluster.on('exit', (worker, code, signal) => {
    log(`worker ${worker.process.pid} died ${signal}`);
  });
}



function slave(){
  doAsync( process.pid )
    .catch(function(err){
      log( 'Error', err );
    })
    .then(function(){
      log( `Completed ${process.pid}`);
    });

  log(`Worker ${process.pid} started`);
}



if (cluster.isMaster) {
  master();
} else {
  slave();
}

