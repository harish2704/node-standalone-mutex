const cluster = require('cluster');
const crypto = require('crypto');



class MasterMutex {
  constructor( id, lockedItems ){
    this.id = id;
    this.isLocked = true;
    this.listeners = [];
    this.lockedItems = lockedItems;
    lockedItems[ this.id ] = this;
  }

  release(){
    this.isLocked = false;
    if( this.listeners.length ){
      this.listeners.pop()( this );
    } else{
      delete this.lockedItems[ this.id ];
    }

    return true;
  }
}



class MasterMutexManager{
  constructor(){
    this._requestQ = {};
    this._lockedItems = {};

  }

  attachMessageHandlers( worker ){
    worker.on( 'message', message =>{
      if( !message.isNodeMutex ){
        return;
      }
      if( message.type === 'acquire' ){
        this.acquire( message.mutexId )
          .then(function( mutex ){
            worker.send({
              reqId: message.reqId,
              isNodeMutex: true,
              type: 'acquired',
              mutexId: mutex.id,
            });
          });
      } else if( message.type === 'release' ){
        this._lockedItems[ message.mutexId ].release();
      }
    });
  }

  init(){
    const workers = cluster.workers;
    let id;
    for( id in workers ){
      this.attachMessageHandlers( workers[id] );
    }
  }

  acquire( id ){
    let mutex = this._lockedItems[ id ];
    if( !mutex ){
      return Promise.resolve( new MasterMutex( id, this._lockedItems ) );
    }
    return new Promise( function(resolve){
      mutex.listeners.unshift( resolve );
    });
  }
}



class SlaveMutex{
  constructor( id ){
    this.id = id;
  }

  release(){
    const reqId = process.pid + crypto.randomBytes(4).toString( 'hex' );
    process.send({
      isNodeMutex: true,
      type: 'release',
      reqId: reqId,
      mutexId: this.id
    });
    return true;
  }
}



class SlaveMutextManager{

  constructor(){
    this._requestQ = {};
    process.on( 'message',  message => {
      if( !message.isNodeMutex ){
        return;
      }
      if( this._requestQ[ message.reqId ] ){
        this._requestQ[ message.reqId ]( message );
        delete this._requestQ[ message.reqId ];
      }
    });
  }

  acquire( id ){
    const reqId = process.pid + crypto.randomBytes(4).toString( 'hex' );
    process.send({
      isNodeMutex: true,
      type: 'acquire',
      mutexId: id,
      reqId: reqId,
    });
    return new Promise( resolve => this._requestQ[ reqId ] = resolve )
    .then( function(){
      return new SlaveMutex( id );
    });
  }
}




if (cluster.isMaster) {
  module.exports = new MasterMutexManager();
} else {
  module.exports = new SlaveMutextManager();
}

