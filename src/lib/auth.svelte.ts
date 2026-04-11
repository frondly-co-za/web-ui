import { createAuth0Client, type Auth0Client, type User } from '@auth0/auth0-spa-js';

const domain = import.meta.env.VITE_AUTH0_DOMAIN;
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;

let client: Auth0Client | null = null;

let isAuthenticated = $state(false);
let user = $state<User | undefined>(undefined);
let isLoading = $state(true);

async function getClient() {
	if (!client) {
		client = await createAuth0Client({
			domain,
			clientId,
			authorizationParams: { redirect_uri: `${window.location.origin}/auth/callback` },
			cacheLocation: 'localstorage',
			useRefreshTokens: true
		});
	}
	return client;
}

async function init() {
	const c = await getClient();
	isAuthenticated = await c.isAuthenticated();
	user = isAuthenticated ? await c.getUser() : undefined;
	isLoading = false;
}

/** Call on /auth/callback. Returns the returnTo path to navigate to. */
async function handleCallback(): Promise<string> {
	const c = await getClient();
	const { appState } = await c.handleRedirectCallback();
	isAuthenticated = await c.isAuthenticated();
	user = isAuthenticated ? await c.getUser() : undefined;
	isLoading = false;
	return appState?.returnTo ?? '/';
}

async function login(returnTo = '/') {
	const c = await getClient();
	await c.loginWithRedirect({ appState: { returnTo } });
}

async function logout() {
	const c = await getClient();
	await c.logout({ logoutParams: { returnTo: window.location.origin } });
}

async function getAccessToken(): Promise<string> {
	const c = await getClient();
	return c.getTokenSilently();
}

export const auth = {
	get isAuthenticated() {
		return isAuthenticated;
	},
	get user() {
		return user;
	},
	get isLoading() {
		return isLoading;
	},
	init,
	handleCallback,
	login,
	logout,
	getAccessToken
};
