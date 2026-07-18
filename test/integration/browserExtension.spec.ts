import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('browser extension', () => {
	const extensionDir = resolve(__dirname, '../../src/views/browser-extension');

	describe('manifest.json', () => {
		it('is valid JSON', () => {
			const manifestPath = resolve(extensionDir, 'manifest.json');
			expect(() => JSON.parse(readFileSync(manifestPath, 'utf8'))).not.toThrow();
		});

		it('has manifest_version 3', () => {
			const manifestPath = resolve(extensionDir, 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			expect(manifest.manifest_version).toBe(3);
		});

		it('has correct name', () => {
			const manifestPath = resolve(extensionDir, 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			expect(manifest.name).toBe('Personal Dashboard New Tab');
		});

		it('has correct version', () => {
			const manifestPath = resolve(extensionDir, 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			expect(manifest.version).toBe('1.0.0');
		});

		it('declares newtab override', () => {
			const manifestPath = resolve(extensionDir, 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			expect(manifest.chrome_url_overrides).toBeDefined();
			expect(manifest.chrome_url_overrides.newtab).toBe('newtab.html');
		});

		it('has no permissions', () => {
			const manifestPath = resolve(extensionDir, 'manifest.json');
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
			expect(manifest.permissions).toBeUndefined();
		});
	});

	describe('newtab.html', () => {
		it('exists', () => {
			const htmlPath = resolve(extensionDir, 'newtab.html');
			expect(() => readFileSync(htmlPath, 'utf8')).not.toThrow();
		});

		it('loads only redirect.js', () => {
			const htmlPath = resolve(extensionDir, 'newtab.html');
			const html = readFileSync(htmlPath, 'utf8');
			expect(html).toContain('src="redirect.js"');
			expect(html).not.toContain('src="http');
			expect(html).not.toContain('src="https');
		});

		it('contains accessible fallback text', () => {
			const htmlPath = resolve(extensionDir, 'newtab.html');
			const html = readFileSync(htmlPath, 'utf8');
			expect(html).toContain('<p>');
			expect(html).toContain('Redirecting');
		});
	});

	describe('redirect.js', () => {
		it('exists', () => {
			const jsPath = resolve(extensionDir, 'redirect.js');
			expect(() => readFileSync(jsPath, 'utf8')).not.toThrow();
		});

		it('redirects to dashboard.localhost', () => {
			const jsPath = resolve(extensionDir, 'redirect.js');
			const js = readFileSync(jsPath, 'utf8');
			expect(js).toContain('http://dashboard.localhost/');
		});

		it('uses window.location.replace', () => {
			const jsPath = resolve(extensionDir, 'redirect.js');
			const js = readFileSync(jsPath, 'utf8');
			expect(js).toContain('window.location.replace');
		});

		it('contains no remote code loading mechanisms', () => {
			const jsPath = resolve(extensionDir, 'redirect.js');
			const js = readFileSync(jsPath, 'utf8');
			expect(js).not.toContain('eval');
			expect(js).not.toContain('Function');
			expect(js).not.toContain('importScripts');
			expect(js).not.toContain('document.write');
		});

		it('contains no inline script', () => {
			const jsPath = resolve(extensionDir, 'redirect.js');
			const js = readFileSync(jsPath, 'utf8');
			expect(js.trim()).toBe('window.location.replace(\'http://dashboard.localhost/\');');
		});

		it('contains no credentials or secrets', () => {
			const jsPath = resolve(extensionDir, 'redirect.js');
			const js = readFileSync(jsPath, 'utf8');
			expect(js).not.toContain('token');
			expect(js).not.toContain('secret');
			expect(js).not.toContain('key');
			expect(js).not.toContain('password');
			expect(js).not.toContain('auth');
		});
	});
});