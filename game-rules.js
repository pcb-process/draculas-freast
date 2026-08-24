// Original implementation of the game mechanics; no source artwork or card copy.
export const GUESTS = [
  { id:'dracula', name:'Dracula', mustInclude:true, mystery:false, effect:'retry_accusation' },
  { id:'boogie', name:'Boogie Monster', effect:'accept_dance_after_dance_accuse' },
  { id:'jekyll', name:'Dr. Jekyll', effect:'accept_dance_swap_mystery' },
  { id:'ghost', name:'Ghost', effect:'accept_dance_wrong_accusation_accuse' },
  { id:'swamp', name:'Swamp Creature', effect:'neighbours_only_win' },
  { id:'trickster', name:'Trickster', effect:'always_yes' },
  { id:'helsing', name:'Van Helsing', effect:'all_no_accuse_dracula' },
  { id:'alucard', name:'Alucard', effect:'dracula_answer_and_win' },
  { id:'zombie', name:'Zombie', effect:'neighbour_lie_forced_dance' },
  { id:'witch', name:'Witch', effect:'neighbour_lie' }
];

export function setupGuests(playerCount, random=Math.random) {
  const count = playerCount === 4 ? 6 : playerCount + 1;
  const optional = GUESTS.slice(1).sort(()=>random()-.5).slice(0,count-1);
  const chosen = [GUESTS[0], ...optional];
  const mysteryCount = playerCount === 4 ? 2 : 1;
  const mystery = chosen.slice(1).sort(()=>random()-.5).slice(0,mysteryCount);
  const identities = chosen.filter(g=>!mystery.some(m=>m.id===g.id));
  return { chosen, mystery, identities };
}

export function areNeighbours(players, firstId, secondId) {
  const a=players.findIndex(p=>p.id===firstId), b=players.findIndex(p=>p.id===secondId);
  return Math.abs(a-b)===1 || Math.abs(a-b)===players.length-1;
}

export function inquiryAnswer({ players, respondent, askerId, askedGuestId }) {
  const honest = respondent.guest.id === askedGuestId;
  const neighbour = areNeighbours(players, respondent.id, askerId);
  if (respondent.guest.id === 'trickster') return true;
  if (respondent.guest.id === 'alucard' && askedGuestId === 'dracula') return true;
  if (respondent.guest.id === 'witch' && neighbour) return !honest;
  if (respondent.guest.id === 'zombie' && neighbour) return askedGuestId !== 'witch';
  return honest;
}

export function mustAcceptDance(guestId) {
  return ['boogie','jekyll','ghost'].includes(guestId);
}
