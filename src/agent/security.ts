/**
 * Security Module for NanoCode
 *
 * Provides comprehensive security checks for command execution
 * with 50+ dangerous patterns covering:
 * - File destruction commands
 * - Privilege escalation
 * - Network attacks
 * - Sensitive file access
 * - System service manipulation
 * - Crypto/ransomware patterns
 */

/**
 * Security check result
 */
export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  severity?: 'warn' | 'block';
  pattern?: string;
  category?: SecurityCategory;
}

/**
 * Categories of security threats
 */
export type SecurityCategory =
  | 'file_destruction'
  | 'privilege_escalation'
  | 'network_attack'
  | 'sensitive_file'
  | 'system_service'
  | 'crypto_malware'
  | 'fork_bomb'
  | 'path_traversal'
  | 'code_injection'
  | 'data_exfiltration'
  | 'obfuscation';

/**
 * Security pattern definition
 */
export interface SecurityPattern {
  pattern: RegExp;
  category: SecurityCategory;
  severity: 'warn' | 'block';
  description: string;
}

/**
 * Comprehensive list of dangerous command patterns
 * Organized by category for maintainability
 */
export const SECURITY_PATTERNS: SecurityPattern[] = [
  // ==================== FILE DESTRUCTION ====================
  {
    pattern: /rm\s+(-[rRfF]+\s+)*[\/~]/,
    category: 'file_destruction',
    severity: 'block',
    description: 'Recursive deletion from root or home',
  },
  {
    pattern: /rm\s+-[rRfF]*\s+--no-preserve-root/,
    category: 'file_destruction',
    severity: 'block',
    description: 'Forced root deletion',
  },
  {
    pattern: />\s*\/dev\/(sd[a-z]|nvme|hd[a-z]|vd[a-z])/,
    category: 'file_destruction',
    severity: 'block',
    description: 'Direct disk write',
  },
  {
    pattern: /dd\s+.*of=\/dev\/(sd[a-z]|nvme|hd[a-z]|vd[a-z])/,
    category: 'file_destruction',
    severity: 'block',
    description: 'DD to disk device',
  },
  {
    pattern: /mkfs(\.[a-z0-9]+)?\s+/,
    category: 'file_destruction',
    severity: 'block',
    description: 'Format filesystem',
  },
  {
    pattern: /shred\s+/,
    category: 'file_destruction',
    severity: 'block',
    description: 'Secure file deletion',
  },
  {
    pattern: /wipefs\s+/,
    category: 'file_destruction',
    severity: 'block',
    description: 'Wipe filesystem signatures',
  },
  {
    pattern: /truncate\s+.*-s\s*0/,
    category: 'file_destruction',
    severity: 'warn',
    description: 'Truncate file to zero',
  },

  // ==================== FORK BOMB / DOS ====================
  {
    pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    category: 'fork_bomb',
    severity: 'block',
    description: 'Classic fork bomb',
  },
  {
    pattern: /while\s*\[\s*true\s*\].*fork/i,
    category: 'fork_bomb',
    severity: 'block',
    description: 'Fork loop',
  },
  {
    pattern: /\$\(.*\)\s*&\s*\$\(.*\)/,
    category: 'fork_bomb',
    severity: 'warn',
    description: 'Background process spawning',
  },

  // ==================== PRIVILEGE ESCALATION ====================
  {
    pattern: /sudo\s+.*passwd/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Password modification via sudo',
  },
  {
    pattern: /chmod\s+[0-7]*4[0-7]{2,}/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Set SUID bit',
  },
  {
    pattern: /chmod\s+[0-7]*2[0-7]{2,}/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Set SGID bit',
  },
  {
    pattern: /chmod\s+u\+s/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Add SUID via symbolic mode',
  },
  {
    pattern: /chown\s+.*root/,
    category: 'privilege_escalation',
    severity: 'warn',
    description: 'Change ownership to root',
  },
  {
    pattern: /visudo/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Edit sudoers file',
  },
  {
    pattern: /\/etc\/sudoers/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Access sudoers file',
  },
  {
    pattern: /usermod\s+.*-aG\s+.*(sudo|wheel|admin)/,
    category: 'privilege_escalation',
    severity: 'block',
    description: 'Add user to admin group',
  },

  // ==================== NETWORK ATTACKS ====================
  {
    pattern: /nc\s+(-[a-z]+\s+)*-e\s+\/bin\/(ba)?sh/,
    category: 'network_attack',
    severity: 'block',
    description: 'Netcat reverse shell',
  },
  {
    pattern: /ncat\s+.*--exec/,
    category: 'network_attack',
    severity: 'block',
    description: 'Ncat command execution',
  },
  {
    pattern: /bash\s+-i\s+>&\s*\/dev\/tcp/,
    category: 'network_attack',
    severity: 'block',
    description: 'Bash reverse shell',
  },
  {
    pattern: /python[23]?\s+.*socket.*connect/,
    category: 'network_attack',
    severity: 'warn',
    description: 'Python socket connection',
  },
  {
    pattern: /perl\s+.*socket/i,
    category: 'network_attack',
    severity: 'warn',
    description: 'Perl socket connection',
  },
  {
    pattern: /socat\s+.*exec/i,
    category: 'network_attack',
    severity: 'block',
    description: 'Socat command execution',
  },
  {
    pattern: /iptables\s+.*-F/,
    category: 'network_attack',
    severity: 'block',
    description: 'Flush firewall rules',
  },
  {
    pattern: /ufw\s+disable/,
    category: 'network_attack',
    severity: 'block',
    description: 'Disable firewall',
  },

  // ==================== SENSITIVE FILE ACCESS ====================
  {
    pattern: /\/etc\/shadow/,
    category: 'sensitive_file',
    severity: 'block',
    description: 'Access shadow password file',
  },
  {
    pattern: /\/etc\/passwd/,
    category: 'sensitive_file',
    severity: 'warn',
    description: 'Access passwd file',
  },
  {
    pattern: /~\/\.ssh\/(id_rsa|id_ed25519|id_ecdsa)/,
    category: 'sensitive_file',
    severity: 'block',
    description: 'Access SSH private keys',
  },
  {
    pattern: /\/root\/\.ssh/,
    category: 'sensitive_file',
    severity: 'block',
    description: 'Access root SSH directory',
  },
  {
    pattern: /\.aws\/credentials/,
    category: 'sensitive_file',
    severity: 'block',
    description: 'Access AWS credentials',
  },
  {
    pattern: /\.kube\/config/,
    category: 'sensitive_file',
    severity: 'warn',
    description: 'Access Kubernetes config',
  },
  {
    pattern: /\.docker\/config\.json/,
    category: 'sensitive_file',
    severity: 'warn',
    description: 'Access Docker credentials',
  },
  {
    pattern: /\.env(\.[a-z]+)?$/,
    category: 'sensitive_file',
    severity: 'warn',
    description: 'Access environment files',
  },
  {
    pattern: /\/etc\/ssl\/private/,
    category: 'sensitive_file',
    severity: 'block',
    description: 'Access SSL private keys',
  },
  {
    pattern: /gpg\s+--export-secret-key/,
    category: 'sensitive_file',
    severity: 'block',
    description: 'Export GPG private keys',
  },

  // ==================== SYSTEM SERVICES ====================
  {
    pattern: /systemctl\s+(stop|disable|mask)\s+(sshd|firewalld|iptables)/,
    category: 'system_service',
    severity: 'block',
    description: 'Disable security services',
  },
  {
    pattern: /service\s+.*(stop|disable)/,
    category: 'system_service',
    severity: 'warn',
    description: 'Stop system service',
  },
  {
    pattern: /init\s+[06]/,
    category: 'system_service',
    severity: 'block',
    description: 'System shutdown/reboot',
  },
  {
    pattern: /shutdown\s+/,
    category: 'system_service',
    severity: 'block',
    description: 'System shutdown',
  },
  {
    pattern: /reboot(\s|$)/,
    category: 'system_service',
    severity: 'block',
    description: 'System reboot',
  },
  {
    pattern: /halt(\s|$)/,
    category: 'system_service',
    severity: 'block',
    description: 'System halt',
  },
  {
    pattern: /poweroff(\s|$)/,
    category: 'system_service',
    severity: 'block',
    description: 'System poweroff',
  },
  {
    pattern: /kill\s+-9\s+1\b/,
    category: 'system_service',
    severity: 'block',
    description: 'Kill init process',
  },

  // ==================== CRYPTO/MALWARE ====================
  {
    pattern: /openssl\s+.*enc.*-aes/,
    category: 'crypto_malware',
    severity: 'warn',
    description: 'OpenSSL encryption (potential ransomware)',
  },
  {
    pattern: /gpg\s+.*--symmetric/,
    category: 'crypto_malware',
    severity: 'warn',
    description: 'GPG symmetric encryption',
  },
  {
    pattern: /xmrig|cryptominer|minerd/i,
    category: 'crypto_malware',
    severity: 'block',
    description: 'Cryptocurrency miner',
  },

  // ==================== CODE INJECTION ====================
  {
    pattern: /eval\s*\$\(/,
    category: 'code_injection',
    severity: 'warn',
    description: 'Eval command substitution',
  },
  {
    pattern: /bash\s+-c\s+"\$\(/,
    category: 'code_injection',
    severity: 'warn',
    description: 'Bash command injection',
  },
  {
    pattern: /curl\s+.*\|\s*(ba)?sh/,
    category: 'code_injection',
    severity: 'block',
    description: 'Curl pipe to shell',
  },
  {
    pattern: /wget\s+.*\|\s*(ba)?sh/,
    category: 'code_injection',
    severity: 'block',
    description: 'Wget pipe to shell',
  },
  {
    pattern: /curl\s+.*-o.*&&.*\.\//,
    category: 'code_injection',
    severity: 'warn',
    description: 'Download and execute',
  },

  // ==================== DATA EXFILTRATION ====================
  {
    pattern: /curl\s+.*--data.*@/,
    category: 'data_exfiltration',
    severity: 'warn',
    description: 'Curl POST with file data',
  },
  {
    pattern: /scp\s+.*@.*:/,
    category: 'data_exfiltration',
    severity: 'warn',
    description: 'SCP to remote host',
  },
  {
    pattern: /rsync\s+.*@.*:/,
    category: 'data_exfiltration',
    severity: 'warn',
    description: 'Rsync to remote host',
  },

  // ==================== PATH TRAVERSAL ====================
  {
    pattern: /\.\.\/\.\.\//,
    category: 'path_traversal',
    severity: 'warn',
    description: 'Path traversal pattern',
  },
  {
    pattern: /\$\(pwd\).*\.\./,
    category: 'path_traversal',
    severity: 'warn',
    description: 'PWD with traversal',
  },

  // ==================== OBFUSCATION / EVASION ====================
  {
    pattern: /base64\s+-d/,
    category: 'obfuscation',
    severity: 'block',
    description: 'Base64 decoding (potential obfuscation)',
  },
  {
    pattern: /echo\s+.*\\x[0-9a-fA-F]{2}/,
    category: 'obfuscation',
    severity: 'block',
    description: 'Hex encoded payload',
  },
  {
    pattern: /(\$\w+){2,}/,
    category: 'obfuscation',
    severity: 'warn',
    description: 'Excessive variable substitution',
  },
  {
    pattern: /\$\(.*\)\s*-rf/,
    category: 'obfuscation',
    severity: 'block',
    description: 'Command substitution with destructive flags',
  },
  {
    pattern: /`.*`\s*-rf/,
    category: 'obfuscation',
    severity: 'block',
    description: 'Backtick execution with destructive flags',
  },
  {
    pattern: /[^\x20-\x7E\t\n\r]/,
    category: 'obfuscation',
    severity: 'warn',
    description: 'Non-printable/Unicode characters (potential evasion)',
  },
];

/**
 * Path blacklist - directories that should never be modified
 */
export const PATH_BLACKLIST: string[] = [
  '/',
  '/bin',
  '/sbin',
  '/usr/bin',
  '/usr/sbin',
  '/etc',
  '/boot',
  '/sys',
  '/proc',
  '/dev',
  '/root',
  '/var/log',
  '/var/run',
  '/lib',
  '/lib64',
  '/usr/lib',
  '/usr/lib64',
];

/**
 * Check if a command is potentially dangerous
 */
export function checkCommandSecurity(command: string): SecurityCheckResult {
  const normalizedCommand = command.toLowerCase().trim();

  for (const pattern of SECURITY_PATTERNS) {
    if (pattern.pattern.test(normalizedCommand) || pattern.pattern.test(command)) {
      return {
        allowed: pattern.severity !== 'block',
        reason: pattern.description,
        severity: pattern.severity,
        pattern: pattern.pattern.source,
        category: pattern.category,
      };
    }
  }

  return { allowed: true };
}

/**
 * Check if a path is in the blacklist
 */
export function isPathBlacklisted(targetPath: string): boolean {
  const normalizedPath = targetPath.replace(/\/+$/, '') || '/'; // Remove trailing slashes, default to / for empty
  return PATH_BLACKLIST.some(
    (blacklisted) => normalizedPath === blacklisted || normalizedPath.startsWith(blacklisted + '/'),
  );
}

/**
 * Comprehensive security check combining command and path analysis
 */
export function performSecurityCheck(
  command: string,
  targetPaths?: string[],
): SecurityCheckResult {
  // Check command patterns
  const commandResult = checkCommandSecurity(command);
  if (!commandResult.allowed) {
    return commandResult;
  }

  // Check target paths if provided
  if (targetPaths) {
    for (const targetPath of targetPaths) {
      if (isPathBlacklisted(targetPath)) {
        return {
          allowed: false,
          reason: `Target path is blacklisted: ${targetPath}`,
          severity: 'block',
          category: 'file_destruction',
        };
      }
    }
  }

  // Return command result (may have warnings)
  return commandResult;
}

/**
 * Quick check if command should be blocked (for simple use)
 */
export function isDangerous(command: string): boolean {
  const result = checkCommandSecurity(command);
  return result.severity === 'block';
}

/**
 * Get all blocked patterns for documentation
 */
export function getBlockedPatterns(): SecurityPattern[] {
  return SECURITY_PATTERNS.filter((p) => p.severity === 'block');
}

/**
 * Get all warning patterns for documentation
 */
export function getWarningPatterns(): SecurityPattern[] {
  return SECURITY_PATTERNS.filter((p) => p.severity === 'warn');
}
