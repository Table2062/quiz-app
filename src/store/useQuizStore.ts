import create from 'zustand';

export const useQuizStore = create(set => ({
    user: null,
    setUser: (user) => set({ user }),
    score: 0,
    setScore: (score) => set({ score }),
    leaderboard: [],
    setLeaderboard: (lb) => set({ leaderboard: lb }),
}));