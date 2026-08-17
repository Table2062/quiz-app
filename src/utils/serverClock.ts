/**
 * Stima lo scarto (offset) tra l'orologio del dispositivo client e quello del server,
 * per evitare che countdown/timer risultino sfasati quando l'orologio locale del
 * dispositivo (telefono/tablet degli ospiti) non è sincronizzato correttamente.
 *
 * Funziona leggendo l'header HTTP "Date" restituito dal nostro stesso server (Next.js),
 * che è sempre sincronizzato in modo affidabile (NTP) sui provider cloud.
 */
export async function getServerClockOffsetMs(): Promise<number> {
    try {
        const clientBefore = Date.now();
        const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
        const clientAfter = Date.now();

        const serverDateHeader = res.headers.get('date');
        if (!serverDateHeader) return 0;

        const serverTime = new Date(serverDateHeader).getTime();
        // Compensa la latenza di rete stimando il momento in cui il server ha risposto
        // come il punto medio tra invio e ricezione della richiesta.
        const roundTripMid = clientBefore + (clientAfter - clientBefore) / 2;

        return serverTime - roundTripMid;
    } catch {
        return 0;
    }
}

/** Ritorna il tempo corrente "corretto", applicando l'offset stimato con il server. */
export function nowSynced(offsetMs: number): number {
    return Date.now() + offsetMs;
}
