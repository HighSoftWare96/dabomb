const DbService = require('moleculer-db');
const SqlAdapter = require('moleculer-db-adapter-sequelize');
const Sequelize = require('sequelize');
const { Op } = Sequelize;
const { db } = require('config');
const { notFound, roomFull } = require('helpers/errors');
const uuid = require('uuid');
const { createInviteId } = require('../helpers/random');

module.exports = {
  name: 'room',
  mixins: [DbService],
  adapter: new SqlAdapter(db.connectionString),
  model: {
    name: 'room',
    define: {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
        unique: true
      },
      inviteId: {
        type: Sequelize.STRING(255),
        unique: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      // id del partecipante admin
      adminPartecipantId: Sequelize.INTEGER,
      // ids dei partecipanti
      partecipantIds: {
        type: Sequelize.ARRAY(Sequelize.INTEGER),
        defaultValue: []
      },
      // id room socketio associata
      socketioRoom: Sequelize.STRING,
      // id della partita corrente
      currentGameId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        unique: true
      },
      // TODO: aggiornare?
      // id delle partite precedenti
      playedGameIds: Sequelize.ARRAY(Sequelize.INTEGER),
      // stanza bloccata in gioco
      locked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // OPZIONI PER LA STANZA
      // numero massimo di partecipanti
      maxPartecipants: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 5
      }
    },
    options: {
      indexes: [
        {
          unique: true,
          fields: ['id']
        },
        {
          unique: true,
          fields: ['socketioRoom']
        },
        {
          unique: true,
          fields: ['currentGameId']
        }
      ]
    }
  },
  actions: {
    create: {
      params: {
        name: {
          type: 'string'
        },
        maxPartecipants: {
          type: 'number',
          integer: true,
          positive: true,
          convert: true,
          optional: true
        }
      },
      async handler(ctx) {
        try {
          let { params } = ctx;
          const { id: adminPartecipantId } = ctx.meta.user;
          const partecipant = ctx.meta.user;

          if (partecipant.socketId !== null) {
            return Promise.reject(
              notFound('partecipant', adminPartecipantId)
            );
          }

          const inviteId = createInviteId();

          params = this.sanitizeParams(ctx, params);
          return this._create(ctx, {
            ...params,
            adminPartecipantId,
            inviteId,
          });
        } catch (e) {
          this.logger.error(e);
          return Promise.reject(e);
        }
      }
    },
    join: {
      params: {
        inviteId: 'string'
      },
      async handler(ctx) {
        try {
          const { inviteId } = ctx.params;
          const { id: partecipantId } = ctx.meta.user;
          const partecipant = ctx.meta.user;

          // recupero la stanza
          let room = await this._find(ctx, {
            query: {
              inviteId,
              locked: false,
              [Op.not]: {
                partecipantIds: {
                  [Op.contains]: [partecipantId]
                }
              }
            }
          });

          if (!room || !room.length) {
            return Promise.reject(
              notFound('room', inviteId)
            );
          }

          room = room[0];

          if (partecipant.socketId !== null) {
            return Promise.reject(
              notFound('partecipant', partecipantId)
            );
          }

          // controllo il numero massimo di partecipanti
          if (
            room.partecipantIds &&
            room.partecipantIds.length >= room.maxPartecipants
          ) {
            return Promise.reject(
              roomFull(inviteId)
            );
          }

          if (!room.socketioRoom) {
            // creo la socketio room
            room.socketioRoom = uuid.v4();
          }

          // aggiungo il partecipante alla stanza su db
          return this._update(ctx, {
            id: room.id,
            socketioRoom: room.socketioRoom,
            partecipantIds: [
              partecipantId,
              ...(room.partecipantIds || [])
            ]
          });
        } catch (e) {
          this.logger.error(e);
          return Promise.reject(e);
        }
      }
    },
    // chiamata da socketio quando un client
    // si disconnette
    leave: {
      params: {
        id: {
          type: 'number',
          integer: true,
          positive: true,
          convert: true
        }
      },
      async handler(ctx) {
        try {
          const { id } = ctx.params;
          const { id: partecipantId } = ctx.meta.user;
          const partecipant = ctx.meta.user;

          // cerco la stanza con quel partecipante
          const foundRooms = await this._find(ctx, {
            query: {
              id,
              partecipantIds: {
                [Op.contains]: [partecipantId]
              }
            }
          });

          if (!foundRooms || !foundRooms.length || !foundRooms[0]) {
            return Promise.reject(
              notFound('room', id)
            );
          }
          const room = foundRooms[0];

          // disconnetto il client dal socket
          if(partecipant.socketId) {
            await this.broker.call('socketio.disconnectClient', {
              socketId: partecipant.socketId
            });
          }

          // rimuovo il socketid dal partecipant
          await this.broker.call('partecipant.update', {
            id: partecipant.id,
            socketId: null
          });

          const foundIndex =
            room.partecipantIds.findIndex(i => i === partecipantId);

          if (foundIndex >= 0) {
            // rimuovo il giocatore dalla stanza
            room.partecipantIds.splice(foundIndex, 1);
          }

          if (room.partecipantIds.length <= 1 && room.currentGameId) {
            // rimasto meno di un giocatore: termino eventuale gioco
            await this.broker.call('game.endGame', {
              id: room.currentGameId
            });
          }

          // non ci sono più partecipanti: elimino la stanza
          if (room.partecipantIds.length === 0) {
            return this._remove(ctx, {
              id: room.id
            });
          }
          
          if (room.adminPartecipantId === partecipant.id) {
            // la stanza è stata lasciata dall'admin
            // promuovo il prossimo partecipante a admin
            room.adminPartecipantId = room.partecipantIds[0];
          }

          // in caso normale aggiorno la stanza
          return this._update(ctx, {
            id: room.id,
            partecipantIds: room.partecipantIds,
            adminPartecipantId: room.adminPartecipantId
          });
        } catch (e) {
          this.logger.error(e);
          return Promise.reject(e);
        }
      }
    },
    getByInviteId: {
      params: {
        inviteId: 'string'
      },
      async handler(ctx) {
        try {
          const { inviteId } = ctx.params;
          const rooms = await this._find(ctx, {
            query: { inviteId, locked: false }
          });
          if (!rooms || !rooms.length || rooms.length !== 1) {
            return Promise.reject(notFound('room', inviteId));
          }
          const room = rooms[0];

          delete room.adminPartecipantId;
          delete room.partecipantIds;
          delete room.socketioRoom;
          delete room.currentGameId;
          delete room.playedGameIds;
          delete room.locked;

          return room;
        } catch (e) {
          this.logger.error(e);
          return Promise.reject(e);
        }
      }
    },
    goWaitingRoom: {
      params: {
        roomId: 'number'
      },
      async handler(ctx) {
        try {
          const {roomId} = ctx.params;

          // find a room that has no game active
          const rooms = await this._find(ctx, {
            query: {
              id: roomId, 
              locked: false, 
              currentGameId: null
            }
          });
          
          if (!rooms || !rooms.length || rooms.length !== 1) {
            return Promise.reject(notFound('room', roomId));
          }

          const room = rooms[0];
          return this.broker.call('socketio.goWaitingRoomBroadcast', {
            socketioRoom: room.socketioRoom
          });
        } catch(e) {
          this.logger.error(e);
          return Promise.reject(e);
        }
      }
    }
  }
};
