import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

/* =========================================================
 * Types
 * ======================================================= */

export type ImportedEntry = {
  type: 'account';
  title: string;
  username: string;
  password: string;
  aliases: string;
  note: string;
  alwaysVisible: boolean;
  selected: boolean;
  confidence: 'high' | 'medium';
  originalText: string;
};

export type ImportedNote = {
  type: 'note';
  title: string;
  content: string;
  selected: boolean;
  originalText: string;
};

export type ImportedReview = {
  type: 'review';
  title: string;
  username: string;
  password: string;
  content: string;
  selected: boolean;
  reason: string;
  originalText: string;
};

type ImportedResult =
  | ImportedEntry
  | ImportedNote
  | ImportedReview;

/* =========================================================
 * Label definitions
 * ======================================================= */

/*
 * 라벨만 단독으로 있는 경우
 *
 * ID
 * kim123
 *
 * PW
 * abc1234!
 */
const ID_LABEL =
  /^(?:id|아이디|username|user\s*name|login|로그인|email|이메일)$/i;

const PW_LABEL =
  /^(?:pw|p\/w|password|pass|비밀번호|비번|암호)$/i;

/*
 * 라벨 + 값
 *
 * ID kim123
 * ID: kim123
 * ID=kim123
 * ID - kim123
 *
 * ★ 기존 코드와 달리 콜론이 없어도 인식한다.
 */
const ID_INLINE =
  /^(?:id|아이디|username|user\s*name|login|로그인|email|이메일)\s*(?::|=|：|-)?\s+(.+)$/i;

const PW_INLINE =
  /^(?:pw|p\/w|password|pass|비밀번호|비번|암호)\s*(?::|=|：|-)?\s+(.+)$/i;

/*
 * 콜론/등호가 바로 붙는 경우도 허용
 *
 * ID:kim123
 * PW=qwer1234
 */
const ID_INLINE_TIGHT =
  /^(?:id|아이디|username|user\s*name|login|로그인|email|이메일)\s*(?::|=|：|-)\s*(.+)$/i;

const PW_INLINE_TIGHT =
  /^(?:pw|p\/w|password|pass|비밀번호|비번|암호)\s*(?::|=|：|-)\s*(.+)$/i;

const SERVICE_INLINE =
  /^(?:서비스|서비스명|사이트|사이트명|제목|title|site)\s*(?::|=|：|-)?\s*(.+)$/i;

/* =========================================================
 * Utility
 * ======================================================= */

function cleanLine(value: string): string {
  return value
    .replace(/\uFEFF/g, '')
    .replace(/^[\s>*•·▪▫◦‣▶▷→]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanValue(value: string): string {
  let result = value.trim();

  result = result.replace(/^[\"'“”‘’]+/, '');
  result = result.replace(/[\"'“”‘’]+$/, '');

  return result.trim();
}

function isUrl(value: string): boolean {
  return /^(?:https?:\/\/|www\.)/i.test(
    value.trim(),
  );
}

function isEmail(value: string): boolean {
  return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(
    value.trim(),
  );
}

/*
 * 일반적인 문장인지 판단.
 *
 * ★ 중요
 * 비밀번호 끝에 ! ? . 등이 있다고 해서
 * 문장으로 판단하지 않는다.
 */
function isSentence(value: string): boolean {
  const v = cleanValue(value);

  if (!v) {
    return false;
  }

  if (v.length > 150) {
    return true;
  }

  if (
    /\s/.test(v) &&
    v.length > 30
  ) {
    return true;
  }

  return false;
}

function isIdLabel(value: string): boolean {
  return ID_LABEL.test(
    cleanLine(value),
  );
}

function isPwLabel(value: string): boolean {
  return PW_LABEL.test(
    cleanLine(value),
  );
}

function isLabel(value: string): boolean {
  return (
    isIdLabel(value) ||
    isPwLabel(value)
  );
}

/* =========================================================
 * Non-login ID / PW
 * ======================================================= */

function isNonLoginId(value: string): boolean {
  return /^(?:주문|예약|상품|회의|고객|회원|게시물|문서|프로젝트|transaction|order|product|meeting|customer)\s*(?:id|아이디)/i.test(
    cleanLine(value),
  );
}

function isNonLoginPassword(value: string): boolean {
  return /^(?:wifi|wi-?fi|와이파이|공유기|router|현관|문|도어|door|회의실)\s*(?:pw|password|비밀번호|비번)/i.test(
    cleanLine(value),
  );
}

/* =========================================================
 * Username detection
 * ======================================================= */

function looksLikeUsername(
  value: string,
): boolean {
  const v = cleanValue(value);

  if (!v) {
    return false;
  }

  if (v.length > 120) {
    return false;
  }

  if (isUrl(v)) {
    return false;
  }

  if (isLabel(v)) {
    return false;
  }

  /*
   * 일반적인 ID에는 공백이 없다.
   * 이메일도 공백이 없으므로 자연스럽게 허용된다.
   */
  if (/\s/.test(v)) {
    return false;
  }

  /*
   * 너무 긴 문장은 ID로 보지 않는다.
   */
  if (isSentence(v)) {
    return false;
  }

  return true;
}

/* =========================================================
 * Password detection
 * ======================================================= */

function looksLikePassword(
  value: string,
  explicit: boolean = false,
): boolean {
  const v = cleanValue(value);

  if (!v) {
    return false;
  }

  if (v.length > 200) {
    return false;
  }

  if (isUrl(v)) {
    return false;
  }

  /*
   * PW 라벨이 명시되어 있으면
   * 숫자만 있는 PW / 짧은 PW도 허용.
   *
   * PW 1234
   * PW abc
   * PW qwer1234
   */
  if (explicit) {
    return true;
  }

  /*
   * 무라벨 PW는 공백이 있으면
   * 일반 문장일 가능성이 높다.
   */
  if (/\s/.test(v)) {
    return false;
  }

  if (v.length < 4) {
    return false;
  }

  /*
   * 숫자만
   *
   * 12345678
   */
  if (/^\d{4,}$/.test(v)) {
    return true;
  }

  /*
   * 영문/한글/숫자 조합
   *
   * abc1234
   * qwer1234
   * password123
   */
  if (
    /^[A-Za-z가-힣0-9]{4,}$/.test(v)
  ) {
    return true;
  }

  /*
   * 특수문자가 포함된 PW
   *
   * abc1234!
   * Abc!234
   * qwer@1234
   */
  if (
    /^[^\s]{4,}$/.test(v)
  ) {
    const hasLetter =
      /[A-Za-z가-힣]/.test(v);

    const hasNumber =
      /\d/.test(v);

    const hasSpecial =
      /[^A-Za-z0-9가-힣]/.test(v);

    if (
      (hasLetter && hasNumber) ||
      (hasLetter && hasSpecial) ||
      (hasNumber && hasSpecial)
    ) {
      return true;
    }
  }

  return false;
}

/* =========================================================
 * URL → service name
 * ======================================================= */

function serviceFromUrl(
  value: string,
): string {
  try {
    const normalized =
      /^https?:\/\//i.test(value)
        ? value
        : `https://${value}`;

    const host =
      new URL(normalized).hostname;

    return host
      .replace(/^www\./i, '')
      .split('.')[0];
  } catch {
    return value
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0];
  }
}

/* =========================================================
 * Extract inline label
 * ======================================================= */

function extractIdFromLine(
  line: string,
): string | null {
  const value =
    cleanLine(line);

  if (
    isNonLoginId(value)
  ) {
    return null;
  }

  let match =
    value.match(ID_INLINE_TIGHT);

  if (match) {
    const result =
      cleanValue(match[1]);

    return looksLikeUsername(result)
      ? result
      : null;
  }

  match =
    value.match(ID_INLINE);

  if (match) {
    const result =
      cleanValue(match[1]);

    return looksLikeUsername(result)
      ? result
      : null;
  }

  return null;
}

function extractPasswordFromLine(
  line: string,
): string | null {
  const value =
    cleanLine(line);

  if (
    isNonLoginPassword(value)
  ) {
    return null;
  }

  let match =
    value.match(PW_INLINE_TIGHT);

  if (match) {
    const result =
      cleanValue(match[1]);

    return looksLikePassword(
      result,
      true,
    )
      ? result
      : null;
  }

  match =
    value.match(PW_INLINE);

  if (match) {
    const result =
      cleanValue(match[1]);

    return looksLikePassword(
      result,
      true,
    )
      ? result
      : null;
  }

  return null;
}

/* =========================================================
 * Block splitting
 * ======================================================= */

/*
 * 기본적으로 빈 줄을 기준으로 블록을 분리한다.
 *
 * 예:
 *
 * 카카오
 * ID kim456
 * PW qwer1234
 *
 * 구글
 * id kim456
 * pw qwer1234
 *
 * abc마트
 * ID kim456
 * PW qwer1234
 *
 * → 3개 block
 */
function splitBlocks(
  text: string,
): string[] {
  const normalized =
    text
      .replace(/\r\n?/g, '\n')
      .replace(/\u00A0/g, ' ');

  const rawLines =
    normalized.split('\n');

  const blocks: string[] = [];

  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      const block =
        current
          .map(cleanLine)
          .filter(Boolean)
          .join('\n');

      if (block) {
        blocks.push(block);
      }
    }

    current = [];
  };

  for (
    const rawLine of rawLines
  ) {
    const line =
      cleanLine(rawLine);

    if (!line) {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();

  return blocks;
}

/* =========================================================
 * Detect account boundary inside one block
 * ======================================================= */

/*
 * 빈 줄이 제거되거나 일부 메모 앱에서
 * 계정 사이의 빈 줄이 사라지는 경우까지 대비한다.
 *
 * 예:
 *
 * 카카오
 * ID kim456
 * PW qwer1234
 * 구글
 * ID kim456
 * PW qwer1234
 *
 * 이런 경우도 각각 계정으로 분리할 수 있도록 한다.
 */
function splitAccountBlocks(
  text: string,
): string[] {
  const blocks =
    splitBlocks(text);

  const result: string[] = [];

  for (
    const block of blocks
  ) {
    const lines =
      block
        .split('\n')
        .map(cleanLine)
        .filter(Boolean);

    if (lines.length < 4) {
      result.push(block);
      continue;
    }

    /*
     * 이미 하나의 계정 구조라면 그대로 둔다.
     */
    const firstIdIndex =
      lines.findIndex(
        line =>
          extractIdFromLine(line) !== null,
      );

    const firstPwIndex =
      lines.findIndex(
        line =>
          extractPasswordFromLine(line) !== null,
      );

    /*
     * ID/PW가 없으면 일반 메모.
     */
    if (
      firstIdIndex < 0 ||
      firstPwIndex < 0
    ) {
      result.push(block);
      continue;
    }

    /*
     * ID + PW 이후에 또 다른 ID가 나오면
     * 새로운 계정의 시작일 가능성이 높다.
     */
    const boundaries: number[] = [];

    for (
      let i = firstPwIndex + 1;
      i < lines.length;
      i += 1
    ) {
      if (
        extractIdFromLine(
          lines[i],
        ) !== null
      ) {
        boundaries.push(i);
      }
    }

    if (
      boundaries.length === 0
    ) {
      result.push(block);
      continue;
    }

    let start = 0;

    for (
      const boundary of boundaries
    ) {
      const part =
        lines
          .slice(start, boundary)
          .join('\n');

      if (part.trim()) {
        result.push(part);
      }

      start = boundary - 1;

      /*
       * boundary 바로 앞 줄이 서비스명일 가능성이
       * 높기 때문에 그 줄부터 다음 계정으로
       * 가져간다.
       */
      if (
        start < 0
      ) {
        start = boundary;
      }
    }

    const lastPart =
      lines
        .slice(start)
        .join('\n');

    if (lastPart.trim()) {
      result.push(lastPart);
    }
  }

  return result;
}

/* =========================================================
 * Three-part parser
 *
 * 네이버 / hong123 / abc1234!
 * 네이버 | hong123 | abc1234!
 * 네이버, hong123, abc1234!
 * ======================================================= */

function parseThreePartLine(
  line: string,
): {
  service: string;
  username: string;
  password: string;
} | null {
  const parts =
    line
      .split(
        /\s*(?:\||,|;|→|->)\s*/,
      )
      .map(cleanValue)
      .filter(Boolean);

  if (parts.length !== 3) {
    return null;
  }

  const service =
    parts[0];

  const username =
    parts[1];

  const password =
    parts[2];

  if (!service) {
    return null;
  }

  if (
    !looksLikeUsername(username)
  ) {
    return null;
  }

  if (
    !looksLikePassword(password)
  ) {
    return null;
  }

  return {
    service,
    username,
    password,
  };
}

/* =========================================================
 * Slash three-part parser
 *
 * 네이버 / hong123 / abc1234!
 * ======================================================= */

function parseSlashThreePartLine(
  line: string,
): {
  service: string;
  username: string;
  password: string;
} | null {
  const match =
    line.match(
      /^(.+?)\s*\/\s*(\S+)\s*\/\s*(\S+)$/,
    );

  if (!match) {
    return null;
  }

  const service =
    cleanValue(match[1]);

  const username =
    cleanValue(match[2]);

  const password =
    cleanValue(match[3]);

  if (!service) {
    return null;
  }

  if (
    !looksLikeUsername(username)
  ) {
    return null;
  }

  if (
    !looksLikePassword(password)
  ) {
    return null;
  }

  return {
    service,
    username,
    password,
  };
}

/* =========================================================
 * Two-part parser
 *
 * hong123 : abc1234!
 * hong123 = abc1234!
 * ======================================================= */

function parseTwoPartLine(
  line: string,
): {
  username: string;
  password: string;
} | null {
  const match =
    line.match(
      /^(.+?)\s*(?:\||:|：|=|→|->)\s*(.+)$/,
    );

  if (!match) {
    return null;
  }

  const username =
    cleanValue(match[1]);

  const password =
    cleanValue(match[2]);

  if (
    !looksLikeUsername(username)
  ) {
    return null;
  }

  if (
    !looksLikePassword(password)
  ) {
    return null;
  }

  return {
    username,
    password,
  };
}

/* =========================================================
 * Slash two-part parser
 * ======================================================= */

function parseSlashTwoPartLine(
  line: string,
): {
  username: string;
  password: string;
} | null {
  const match =
    line.match(
      /^([^\s/]+)\s*\/\s*(\S+)$/,
    );

  if (!match) {
    return null;
  }

  const username =
    cleanValue(match[1]);

  const password =
    cleanValue(match[2]);

  if (
    !looksLikeUsername(username)
  ) {
    return null;
  }

  if (
    !looksLikePassword(password)
  ) {
    return null;
  }

  return {
    username,
    password,
  };
}

/* =========================================================
 * Credential extraction
 * ======================================================= */

type CredentialResult = {
  title: string;
  username: string;
  password: string;

  titleIndex: number;
  usernameIndex: number;
  passwordIndex: number;

  explicitId: boolean;
  explicitPassword: boolean;

  score: number;
};

function extractCredentials(
  lines: string[],
): CredentialResult {
  let title = '';
  let username = '';
  let password = '';

  let titleIndex = -1;
  let usernameIndex = -1;
  let passwordIndex = -1;

  let explicitId = false;
  let explicitPassword = false;

  let score = 0;

  /* -------------------------------------------------------
   * 1. Service inline
   * ----------------------------------------------------- */

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    const line =
      lines[i];

    const serviceMatch =
      line.match(
        SERVICE_INLINE,
      );

    if (serviceMatch) {
      const value =
        cleanValue(
          serviceMatch[1],
        );

      if (value) {
        title = value;
        titleIndex = i;
        score += 5;
        break;
      }
    }
  }

  /* -------------------------------------------------------
   * 2. ID / PW inline
   *
   * ★ 핵심
   *
   * ID kim456
   * PW qwer1234
   *
   * 콜론 없이 공백만 있어도 인식.
   * ----------------------------------------------------- */

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    const line =
      lines[i];

    if (!username) {
      const id =
        extractIdFromLine(line);

      if (id) {
        username = id;
        usernameIndex = i;
        explicitId = true;
        score += 10;
      }
    }

    if (!password) {
      const pw =
        extractPasswordFromLine(line);

      if (pw) {
        password = pw;
        passwordIndex = i;
        explicitPassword = true;
        score += 10;
      }
    }
  }

  /* -------------------------------------------------------
   * 3. ID / PW 라벨 + 다음 줄
   *
   * ID
   * kim456
   *
   * PW
   * qwer1234
   * ----------------------------------------------------- */

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    const line =
      lines[i];

    if (
      !username &&
      isIdLabel(line) &&
      !isNonLoginId(line)
    ) {
      const next =
        lines[i + 1];

      if (
        next &&
        looksLikeUsername(next)
      ) {
        username =
          cleanValue(next);

        usernameIndex =
          i + 1;

        explicitId = true;
        score += 10;
      }
    }

    if (
      !password &&
      isPwLabel(line) &&
      !isNonLoginPassword(line)
    ) {
      const next =
        lines[i + 1];

      if (
        next &&
        looksLikePassword(
          next,
          true,
        )
      ) {
        password =
          cleanValue(next);

        passwordIndex =
          i + 1;

        explicitPassword = true;
        score += 10;
      }
    }
  }

  /* -------------------------------------------------------
   * 4. 서비스 / ID / PW 한 줄
   * ----------------------------------------------------- */

  for (
    let i = 0;
    i < lines.length;
    i += 1
  ) {
    const parsed =
      parseThreePartLine(
        lines[i],
      ) ??
      parseSlashThreePartLine(
        lines[i],
      );

    if (!parsed) {
      continue;
    }

    if (!title) {
      title =
        parsed.service;

      titleIndex = i;
    }

    if (!username) {
      username =
        parsed.username;

      usernameIndex = i;
    }

    if (!password) {
      password =
        parsed.password;

      passwordIndex = i;
    }

    score += 12;
    break;
  }

  /* -------------------------------------------------------
   * 5. ID / PW 한 줄
   * ----------------------------------------------------- */

  if (
    !username ||
    !password
  ) {
    for (
      let i = 0;
      i < lines.length;
      i += 1
    ) {
      const parsed =
        parseTwoPartLine(
          lines[i],
        ) ??
        parseSlashTwoPartLine(
          lines[i],
        );

      if (!parsed) {
        continue;
      }

      if (!username) {
        username =
          parsed.username;

        usernameIndex = i;
      }

      if (!password) {
        password =
          parsed.password;

        passwordIndex = i;
      }

      score += 8;
      break;
    }
  }

  /* -------------------------------------------------------
   * 6. 이메일 ID
   * ----------------------------------------------------- */

  if (!username) {
    for (
      let i = 0;
      i < lines.length;
      i += 1
    ) {
      if (
        isEmail(lines[i])
      ) {
        username =
          lines[i];

        usernameIndex = i;

        score += 5;
        break;
      }
    }
  }

  /* -------------------------------------------------------
   * 7. 서비스명 찾기
   *
   * 첫 줄이 서비스명인 경우
   *
   * 카카오
   * ID kim456
   * PW qwer1234
   *
   * → 카카오
   * ----------------------------------------------------- */

  if (
    !title &&
    username &&
    password
  ) {
    /*
     * URL보다 먼저 첫 번째 의미 있는
     * 일반 문자열을 서비스명으로 사용한다.
     */
    for (
      let i = 0;
      i < lines.length;
      i += 1
    ) {
      const line =
        lines[i];

      if (
        i === usernameIndex ||
        i === passwordIndex
      ) {
        continue;
      }

      if (
        isUrl(line) ||
        isLabel(line)
      ) {
        continue;
      }

      if (
        extractIdFromLine(line) ||
        extractPasswordFromLine(line)
      ) {
        continue;
      }

      if (
        isSentence(line) &&
        line.length > 50
      ) {
        continue;
      }

      title = line;
      titleIndex = i;
      score += 5;
      break;
    }
  }

  /* -------------------------------------------------------
   * 8. URL → 서비스명
   * ----------------------------------------------------- */

  if (!title) {
    const urlIndex =
      lines.findIndex(
        isUrl,
      );

    if (urlIndex >= 0) {
      title =
        serviceFromUrl(
          lines[urlIndex],
        );

      titleIndex =
        urlIndex;

      score += 5;
    }
  }

  /* -------------------------------------------------------
   * 9. 완전 무라벨 3줄
   *
   * 네이버
   * hong123
   * abc1234!
   * ----------------------------------------------------- */

  if (
    (!username ||
      !password) &&
    lines.length >= 3
  ) {
    for (
      let i = 0;
      i <= lines.length - 3;
      i += 1
    ) {
      const service =
        lines[i];

      const possibleUsername =
        lines[i + 1];

      const possiblePassword =
        lines[i + 2];

      if (
        isUrl(service) ||
        isLabel(service)
      ) {
        continue;
      }

      if (
        looksLikeUsername(
          possibleUsername,
        ) &&
        looksLikePassword(
          possiblePassword,
        )
      ) {
        if (!title) {
          title = service;
          titleIndex = i;
        }

        if (!username) {
          username =
            possibleUsername;

          usernameIndex =
            i + 1;
        }

        if (!password) {
          password =
            possiblePassword;

          passwordIndex =
            i + 2;
        }

        score += 12;
        break;
      }
    }
  }

  /* -------------------------------------------------------
   * 10. URL + ID + PW
   * ----------------------------------------------------- */

  if (
    (!username ||
      !password) &&
    lines.length >= 3
  ) {
    const urlIndex =
      lines.findIndex(
        isUrl,
      );

    if (urlIndex >= 0) {
      const afterUrl =
        lines.slice(
          urlIndex + 1,
        );

      if (
        afterUrl.length >= 2
      ) {
        const possibleUsername =
          afterUrl[0];

        const possiblePassword =
          afterUrl[1];

        if (
          looksLikeUsername(
            possibleUsername,
          ) &&
          looksLikePassword(
            possiblePassword,
          )
        ) {
          username =
            possibleUsername;

          password =
            possiblePassword;

          usernameIndex =
            urlIndex + 1;

          passwordIndex =
            urlIndex + 2;

          score += 10;
        }
      }
    }
  }

  return {
    title,
    username,
    password,

    titleIndex,
    usernameIndex,
    passwordIndex,

    explicitId,
    explicitPassword,

    score,
  };
}

/* =========================================================
 * Aliases
 * ======================================================= */

function extractAliases(
  block: string,
  title: string,
): string {
  const aliases =
    new Set<string>();

  const urls =
    block.match(
      /(?:https?:\/\/|www\.)[^\s,;|]+/gi,
    ) || [];

  for (
    const url of urls
  ) {
    aliases.add(
      serviceFromUrl(url),
    );
  }

  if (title) {
    aliases.add(
      title.toLowerCase(),
    );
  }

  return Array.from(
    aliases,
  ).join(' · ');
}

/* =========================================================
 * Classify block
 * ======================================================= */

function classifyBlock(
  block: string,
): ImportedResult {
  const lines =
    block
      .split('\n')
      .map(cleanLine)
      .filter(Boolean);

  if (
    lines.length === 0
  ) {
    return {
      type: 'note',
      title: '메모',
      content: block,
      selected: true,
      originalText: block,
    };
  }

  const credential =
    extractCredentials(lines);

  const {
    title,
    username,
    password,
    explicitId,
    explicitPassword,
    score,
  } = credential;

  const hasUsername =
    Boolean(username);

  const hasPassword =
    Boolean(password);

  const hasTitle =
    Boolean(title);

  /*
   * ★ 계정 판정
   *
   * ID + PW가 명시적으로 발견되면
   * 서비스명까지 있으면 계정으로 확정한다.
   *
   * 따라서:
   *
   * 카카오
   * ID kim456
   * PW qwer1234
   *
   * 는 확실한 account가 된다.
   */
  const account =
    hasUsername &&
    hasPassword &&
    hasTitle &&
    (
      explicitId ||
      explicitPassword ||
      score >= 12
    );

  if (account) {
    const note =
      lines
        .filter(
          (line, index) => {
            if (
              index ===
                credential.titleIndex ||
              index ===
                credential.usernameIndex ||
              index ===
                credential.passwordIndex
            ) {
              return false;
            }

            if (
              ID_INLINE.test(line) ||
              ID_INLINE_TIGHT.test(line) ||
              PW_INLINE.test(line) ||
              PW_INLINE_TIGHT.test(line) ||
              SERVICE_INLINE.test(line)
            ) {
              return false;
            }

            if (
              isIdLabel(line) ||
              isPwLabel(line)
            ) {
              return false;
            }

            if (
              isUrl(line)
            ) {
              return false;
            }

            return true;
          },
        )
        .join('\n');

    return {
      type: 'account',

      title:
        title ||
        '서비스명 확인 필요',

      username,
      password,

      aliases:
        extractAliases(
          block,
          title,
        ),

      note,

      alwaysVisible: false,

      selected: true,

      confidence:
        explicitId &&
        explicitPassword
          ? 'high'
          : 'medium',

      originalText: block,
    };
  }

  /* -------------------------------------------------------
   * 애매한 credential
   * ----------------------------------------------------- */

  const hasCredentialEvidence =
    hasUsername ||
    hasPassword ||
    explicitId ||
    explicitPassword;

  if (
    hasCredentialEvidence
  ) {
    let reason =
      '계정 정보일 가능성이 있어 확인이 필요합니다.';

    if (
      hasUsername &&
      !hasPassword
    ) {
      reason =
        'ID 후보는 발견했지만 PW를 확정하지 못했습니다.';
    } else if (
      !hasUsername &&
      hasPassword
    ) {
      reason =
        'PW 후보는 발견했지만 ID를 확정하지 못했습니다.';
    }

    return {
      type: 'review',

      title:
        title ||
        '서비스명 확인 필요',

      username,
      password,

      content: block,

      selected: true,

      reason,

      originalText: block,
    };
  }

  /* -------------------------------------------------------
   * 일반 메모
   * ----------------------------------------------------- */

  return {
    type: 'note',

    title:
      title ||
      lines[0] ||
      '메모',

    content: block,

    selected: true,

    originalText: block,
  };
}

/* =========================================================
 * Public parser
 * ======================================================= */

export function parseImportedText(
  text: string,
): ImportedResult[] {
  if (
    !text ||
    !text.trim()
  ) {
    return [];
  }

  /*
   * 먼저 일반적인 빈 줄 기준으로 나눈다.
   * 이후 빈 줄이 사라진 경우까지
   * splitAccountBlocks에서 보정한다.
   */
  const blocks =
    splitAccountBlocks(text);

  return blocks
    .map(classifyBlock);
}

/* =========================================================
 * Type guards
 * ======================================================= */

function isAccount(
  item: ImportedResult,
): item is ImportedEntry {
  return item.type === 'account';
}

function isNote(
  item: ImportedResult,
): item is ImportedNote {
  return item.type === 'note';
}

function isReview(
  item: ImportedResult,
): item is ImportedReview {
  return item.type === 'review';
}

/* =========================================================
 * Modal
 * ======================================================= */

export default function ImportMemoModal({
  visible,
  onClose,
  onImport,
}: {
  visible: boolean;
  onClose: () => void;
  onImport: (
    entries: ImportedEntry[],
  ) => void;
}) {
  const [
    candidates,
    setCandidates,
  ] =
    useState<ImportedResult[]>([]);

  const [
    reviewing,
    setReviewing,
  ] =
    useState(false);

  /* -------------------------------------------------------
   * Clipboard import
   * ----------------------------------------------------- */

  const importFromClipboard =
    async () => {
      try {
        const text =
          await Clipboard.getStringAsync();

        if (
          !text ||
          !text.trim()
        ) {
          Alert.alert(
            '클립보드가 비어 있습니다',
            '기존 메모 앱에서 내용을 먼저 복사해 주세요.',
          );

          return;
        }

        const parsed =
          parseImportedText(text);

        setCandidates(parsed);
        setReviewing(true);

        const accounts =
          parsed.filter(
            isAccount,
          ).length;

        const notes =
          parsed.filter(
            isNote,
          ).length;

        const reviews =
          parsed.filter(
            isReview,
          ).length;

        Alert.alert(
          '자동 분류 완료',
          `계정 ${accounts}개\n일반 메모 ${notes}개\n확인 필요 ${reviews}개`,
        );
      } catch (error) {
        console.error(
          'ImportMemoModal clipboard error:',
          error,
        );

        Alert.alert(
          '가져오기 실패',
          '클립보드 내용을 가져오는 중 문제가 발생했습니다. 다시 시도해 주세요.',
        );
      }
    };

  /* -------------------------------------------------------
   * Candidate update
   * ----------------------------------------------------- */

  const updateCandidate = (
    index: number,
    key: string,
    value: string | boolean,
  ) => {
    setCandidates(
      current =>
        current.map(
          (item, i) => {
            if (
              i !== index
            ) {
              return item;
            }

            return {
              ...item,
              [key]: value,
            } as ImportedResult;
          },
        ),
    );
  };

  /* -------------------------------------------------------
   * Complete import
   * ----------------------------------------------------- */

  const completeImport =
    () => {
      const selectedAccounts =
        candidates.filter(
          item =>
            item.type ===
              'account' &&
            item.selected,
        ) as ImportedEntry[];

      if (
        selectedAccounts.length ===
        0
      ) {
        Alert.alert(
          '추가할 계정을 선택해 주세요.',
        );

        return;
      }

      onImport(
        selectedAccounts,
      );

      setCandidates([]);
      setReviewing(false);
    };

  /* -------------------------------------------------------
   * Close
   * ----------------------------------------------------- */

  const close = () => {
    setCandidates([]);
    setReviewing(false);
    onClose();
  };

  const accounts =
    candidates.filter(
      isAccount,
    );

  const notes =
    candidates.filter(
      isNote,
    );

  const reviews =
    candidates.filter(
      isReview,
    );

  /* =======================================================
   * Render
   * ===================================================== */

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
    >
      <SafeAreaView
        style={styles.screen}
      >
        {/* Header */}
        <View
          style={styles.header}
        >
          <Pressable
            onPress={close}
          >
            <Text
              style={styles.cancel}
            >
              취소
            </Text>
          </Pressable>

          <Text
            style={
              styles.headerTitle
            }
          >
            {reviewing
              ? '자동 분류 결과'
              : '기존 메모 가져오기'}
          </Text>

          <View
            style={{
              width: 32,
            }}
          />
        </View>

        {!reviewing ? (
          <View
            style={styles.center}
          >
            <Pressable
              style={
                styles.primaryButton
              }
              onPress={() =>
                void importFromClipboard()
              }
            >
              <Text
                style={
                  styles.primaryText
                }
              >
                복사한 내용 붙여넣기
              </Text>
            </Pressable>

            <Text
              style={styles.guide}
            >
              다양한 형식의 메모를
              자동 분석합니다.
              {'\n\n'}
              🔐 계정
              {'   '}
              📝 일반 메모
              {'   '}
              ⚠️ 확인 필요
            </Text>
          </View>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={
                styles.list
              }
            >
              {/* =================================================
               * Accounts
               * =============================================== */}

              {accounts.length >
                0 && (
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  🔐 계정{' '}
                  {accounts.length}
                </Text>
              )}

              {accounts.map(
                item => {
                  const index =
                    candidates.indexOf(
                      item,
                    );

                  return (
                    <View
                      key={
                        `account-${index}`
                      }
                      style={
                        styles.card
                      }
                    >
                      <Pressable
                        style={
                          styles.selectRow
                        }
                        onPress={() =>
                          updateCandidate(
                            index,
                            'selected',
                            !item.selected,
                          )
                        }
                      >
                        <Text
                          style={
                            styles.check
                          }
                        >
                          {item.selected
                            ? '✓'
                            : ''}
                        </Text>

                        <Text
                          style={
                            styles.cardTitle
                          }
                        >
                          {item.confidence ===
                          'high'
                            ? '자동 인식'
                            : '자동 인식 · 확인 권장'}
                        </Text>
                      </Pressable>

                      <Text
                        style={
                          styles.label
                        }
                      >
                        서비스명
                      </Text>

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.title
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'title',
                            v,
                          )
                        }
                      />

                      <Text
                        style={
                          styles.label
                        }
                      >
                        ID
                      </Text>

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.username
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'username',
                            v,
                          )
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <Text
                        style={
                          styles.label
                        }
                      >
                        PW
                      </Text>

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.password
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'password',
                            v,
                          )
                        }
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={
                          false
                        }
                      />

                      {item.note ? (
                        <>
                          <Text
                            style={
                              styles.label
                            }
                          >
                            메모
                          </Text>

                          <TextInput
                            style={
                              styles.noteInput
                            }
                            value={
                              item.note
                            }
                            onChangeText={v =>
                              updateCandidate(
                                index,
                                'note',
                                v,
                              )
                            }
                            multiline
                          />
                        </>
                      ) : null}
                    </View>
                  );
                },
              )}

              {/* =================================================
               * Notes
               * =============================================== */}

              {notes.length >
                0 && (
                <Text
                  style={
                    styles.sectionTitle
                  }
                >
                  📝 일반 메모{' '}
                  {notes.length}
                </Text>
              )}

              {notes.map(
                item => {
                  const index =
                    candidates.indexOf(
                      item,
                    );

                  return (
                    <View
                      key={
                        `note-${index}`
                      }
                      style={
                        styles.noteCard
                      }
                    >
                      <Pressable
                        style={
                          styles.selectRow
                        }
                        onPress={() =>
                          updateCandidate(
                            index,
                            'selected',
                            !item.selected,
                          )
                        }
                      >
                        <Text
                          style={
                            styles.check
                          }
                        >
                          {item.selected
                            ? '✓'
                            : ''}
                        </Text>

                        <Text
                          style={
                            styles.cardTitle
                          }
                        >
                          일반 메모
                        </Text>
                      </Pressable>

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.title
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'title',
                            v,
                          )
                        }
                      />

                      <TextInput
                        style={
                          styles.noteInput
                        }
                        value={
                          item.content
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'content',
                            v,
                          )
                        }
                        multiline
                      />
                    </View>
                  );
                },
              )}

              {/* =================================================
               * Review
               * =============================================== */}

              {reviews.length >
                0 && (
                <Text
                  style={
                    styles.reviewTitle
                  }
                >
                  ⚠️ 확인 필요{' '}
                  {reviews.length}
                </Text>
              )}

              {reviews.map(
                item => {
                  const index =
                    candidates.indexOf(
                      item,
                    );

                  return (
                    <View
                      key={
                        `review-${index}`
                      }
                      style={
                        styles.reviewCard
                      }
                    >
                      <Pressable
                        style={
                          styles.selectRow
                        }
                        onPress={() =>
                          updateCandidate(
                            index,
                            'selected',
                            !item.selected,
                          )
                        }
                      >
                        <Text
                          style={
                            styles.check
                          }
                        >
                          {item.selected
                            ? '✓'
                            : ''}
                        </Text>

                        <Text
                          style={
                            styles.cardTitle
                          }
                        >
                          확인 필요
                        </Text>
                      </Pressable>

                      <Text
                        style={
                          styles.reason
                        }
                      >
                        {item.reason}
                      </Text>

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.title
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'title',
                            v,
                          )
                        }
                        placeholder="서비스명"
                      />

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.username
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'username',
                            v,
                          )
                        }
                        placeholder="ID"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <TextInput
                        style={
                          styles.input
                        }
                        value={
                          item.password
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'password',
                            v,
                          )
                        }
                        placeholder="PW"
                        autoCapitalize="none"
                        autoCorrect={false}
                      />

                      <TextInput
                        style={
                          styles.noteInput
                        }
                        value={
                          item.content
                        }
                        onChangeText={v =>
                          updateCandidate(
                            index,
                            'content',
                            v,
                          )
                        }
                        multiline
                      />
                    </View>
                  );
                },
              )}
            </ScrollView>

            {/* Bottom */}
            <View
              style={styles.bottom}
            >
              <Pressable
                style={
                  styles.secondaryButton
                }
                onPress={() =>
                  setReviewing(false)
                }
              >
                <Text
                  style={
                    styles.secondaryText
                  }
                >
                  다시 붙여넣기
                </Text>
              </Pressable>

              <Pressable
                style={
                  styles.primaryButton
                }
                onPress={
                  completeImport
                }
              >
                <Text
                  style={
                    styles.primaryText
                  }
                >
                  선택한 계정 추가
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* =========================================================
 * Styles
 * ======================================================= */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },

  header: {
    height: 58,
    paddingHorizontal: 20,
    borderBottomWidth:
      StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  cancel: {
    color: '#2362d6',
    fontSize: 16,
    fontWeight: '600',
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#171717',
  },

  center: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },

  guide: {
    marginTop: 18,
    color: '#777',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },

  list: {
    padding: 20,
    paddingBottom: 30,
  },

  sectionTitle: {
    marginBottom: 10,
    marginTop: 4,
    fontSize: 17,
    fontWeight: '800',
    color: '#222',
  },

  reviewTitle: {
    marginBottom: 10,
    marginTop: 12,
    fontSize: 17,
    fontWeight: '800',
    color: '#9a6500',
  },

  card: {
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d8d8d8',
    borderRadius: 12,
    backgroundColor: '#fcfcfc',
  },

  noteCard: {
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    backgroundColor: '#fafafa',
  },

  reviewCard: {
    marginBottom: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#ead8aa',
    borderRadius: 12,
    backgroundColor: '#fffaf0',
  },

  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },

  check: {
    width: 20,
    height: 20,
    marginRight: 8,
    borderRadius: 5,
    backgroundColor: '#2362d6',
    color: '#fff',
    textAlign: 'center',
    fontWeight: '800',
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#555',
  },

  label: {
    marginTop: 7,
    marginBottom: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#707070',
  },

  input: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f0f1f3',
    color: '#1a1a1a',
    fontSize: 15,
  },

  noteInput: {
    minHeight: 80,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f1f3',
    color: '#1a1a1a',
    fontSize: 15,
    textAlignVertical: 'top',
  },

  reason: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fff0c8',
    color: '#795500',
    fontSize: 13,
    lineHeight: 19,
  },

  bottom: {
    padding: 20,
    borderTopWidth:
      StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
  },

  primaryButton: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 11,
    alignItems: 'center',
    backgroundColor: '#2362d6',
  },

  primaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },

  secondaryText: {
    color: '#555',
    fontSize: 15,
    fontWeight: '600',
  },
});