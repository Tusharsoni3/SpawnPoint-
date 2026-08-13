import type {Request,Response} from 'express'
import type {DeepPartial} from 'utility-types';
 
export interface SignUpCredentials{
    name : string,
    email : string,
    password : string
}

export interface LoginCredentials{
    email :  string,
    password : string
}

export type TypedRequest<
  ReqBody = Record<string, unknown>,
  QueryString = Record<string, unknown>
  > = Request<
  Record<string, unknown>,
  Record<string, unknown>,
  DeepPartial<ReqBody>,
  DeepPartial<QueryString>
>;

export interface GameField {
    name? : string,
    genre? : string,
}

export interface CustomeGameFields {
    customFields : Record<string,unknown>;
}

export interface playerRequest {
    playerId? : string,
    displayName? : string,
}