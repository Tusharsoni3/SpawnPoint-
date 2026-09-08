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
            displayName?: string
            email?: string
            password?:string
            user?: AuthTokenPayload;
        }
    }
}

export {}