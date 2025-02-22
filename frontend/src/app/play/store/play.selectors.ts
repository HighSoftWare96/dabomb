import { getRoomates } from './../../start/store/start.selectors';
import { Partecipant } from './../../shared/interfaces/Partecipant';
import { GameState } from './play.reducer';
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { getLoggedPartecipant } from 'src/app/start/store/start.selectors';

export const getPlayFeature = createFeatureSelector<GameState>('game');

export const getCurrentGame = createSelector(
  getPlayFeature,
  (state: GameState) => state.game
);

export const getCurrentRound = createSelector(
  getPlayFeature,
  (state: GameState) => state.round
);

export const getGameResult = createSelector(
  getPlayFeature,
  (state: GameState) => state.gameResult
);

export const getStatus = createSelector(
  getPlayFeature,
  (state: GameState) => state.status
);

export const isMyTurn = createSelector(
  getPlayFeature,
  getLoggedPartecipant,
  (state: GameState, lu: Partecipant) => state && state.round && lu && state.round.currentPartecipantId === lu.id
)

export const isExploded = createSelector(
  getStatus,
  s => s && s === 'ROUND_ENDED'
)

export const isPlaying = createSelector(
  getPlayFeature,
  (state) => state && state.round && !state.round.ended && state.status !== 'END'
)

export const currentPartecipant = createSelector(
  getPlayFeature,
  getRoomates,
  (s, rs) => s && s.round && s.round.currentPartecipantId && rs.find(r => r.id === s.round.currentPartecipantId)
)