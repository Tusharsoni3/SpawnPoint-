export interface AuthTokenPayload {
  id: string;
  email: string;
}


declare global {
    namespace Express {
        interface Request {
            gameId?: string
            developerId?: string
            playerId?: string
            user?: AuthTokenPayload;
        }
    }
}

export {}