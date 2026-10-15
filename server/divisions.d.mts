export interface Division { name: string; min: number }
export interface DivisionInfo { index: number; name: string; points: number; next: string | null; toNext: number; progress: number }
export interface RivalsRecord { points: number; wins: number; draws: number; losses: number; best?: number }
export const DIVISIONS: Division[];
export function divisionIndex(points: number): number;
export function divisionInfo(points: number): DivisionInfo;
export function rivalsDelta(myGoals: number, oppGoals: number, myPoints: number, oppPoints: number, forfeit?: boolean): number;
export function applyRivals(rec: RivalsRecord, myGoals: number, oppGoals: number, oppPoints: number, forfeit?: boolean): { before: number; after: number; delta: number };
