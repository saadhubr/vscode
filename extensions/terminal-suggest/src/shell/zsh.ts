/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';
import * as path from 'path';
import * as fs from 'fs';

let zshBuiltinsCommandDescriptionsCache: Map<string, { shortDescription?: string; description: string; args: string | undefined }> | undefined;

export async function getZshGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getBuiltins(options, existingCommands),
	];
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('zsh', ['-ic', 'alias'], /^(?<alias>[a-zA-Z0-9\._:-]+)=(?<quote>['"]?)(?<resolved>.+?)\k<quote>$/, options);
}

async function getBuiltins(
	options: ExecOptionsWithStringEncoding,
	existingCommands?: Set<string>,
): Promise<(string | ICompletionResource)[]> {
	const compgenOutput = await execHelper('printf "%s\\n" ${(k)builtins}', options);
	const filter = (cmd: string) => cmd && !existingCommands?.has(cmd);
	const builtins: string[] = compgenOutput.split('\n').filter(filter);
	const completions: ICompletionResource[] = [];
	if (builtins.find(r => r === '.')) {
		completions.push({
			label: '.',
			detail: 'Source a file in the current shell',
			kind: vscode.TerminalCompletionItemKind.Method
		});
	}

	if (!zshBuiltinsCommandDescriptionsCache) {
		const cacheFilePath = path.join(__dirname, 'zshBuiltinsCache.json');
		if (fs.existsSync(cacheFilePath)) {
			try {
				const cacheFileContent = fs.readFileSync(cacheFilePath, 'utf8');
				const cacheObject = JSON.parse(cacheFileContent);
				zshBuiltinsCommandDescriptionsCache = new Map(Object.entries(cacheObject));
			} catch (e) {
				console.error('Failed to load zsh builtins cache', e);
			}
		} else {
			console.warn('zsh builtins cache not found');
		}
	}

	for (const cmd of zshBuiltinsCommandDescriptionsCache?.keys() ?? []) {
		if (typeof cmd === 'string') {
			try {
				const result = getCommandDescription(cmd);
				completions.push({
					label: { label: cmd, description: result?.description },
					detail: result?.args,
					documentation: new vscode.MarkdownString(result?.documentation),
					kind: vscode.TerminalCompletionItemKind.Method
				});

			} catch (e) {
				// Ignore errors
				console.log(`Error getting info for ${e}`);
				completions.push({
					label: cmd,
					kind: vscode.TerminalCompletionItemKind.Method
				});
			}
		}
	}

	return completions;
}

export function getCommandDescription(command: string): { documentation?: string; description?: string; args?: string | undefined } | undefined {
	if (!zshBuiltinsCommandDescriptionsCache) {
		return undefined;
	}
	const result = zshBuiltinsCommandDescriptionsCache?.get(command);
	if (result?.shortDescription) {
		return {
			description: result.shortDescription,
			args: result.args,
			documentation: result.description
		};
	} else {
		return {
			description: result?.description,
			args: result?.args,
			documentation: result?.description
		};
	}
}
