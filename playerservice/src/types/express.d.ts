declare global {
    namespace Express {
        interface Request {
            gameId?: string
            developerId?: string
            playerId?: string
        }
    }
}

export {}