import { create } from 'zustand';

export const useQuizStore = create(set => ({
    user: null,
    setUser: (user: any) => set({ user }),
    score: 0,
    setScore: (score: any) => set({ score }),
    leaderboard: [],
    setLeaderboard: (lb: any) => set({ leaderboard: lb }),
}));