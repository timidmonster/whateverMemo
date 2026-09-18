import * as Clipboard from 'expo-clipboard';
import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import ImportMemoModal, {
  ImportedEntry,
} from './ImportMemoModal';

type Entry = {
  id: string;
  title: string;
  username?: string;
  password?: string;
  aliases?: string;
  alwaysVisible?: boolean;
};

const initialEntries: Entry[] = [
  {
    id: 'naver',
    title: '네이버',
    username: 'myname@naver.com',
    password: 'password123',
    aliases: 'naver · 네이버 · nid.naver.com',
  },
];

const normalize = (value: string) =>
  value.toLocaleLowerCase().replace(/[\s._:/-]/g, '');

const matchesInitials = (text: string, query: string) => {
  const ranges: Record<string, string> = {
    ㄱ: '가-깋', ㄲ: '까-낗', ㄴ: '나-닣', ㄷ: '다-딯',
    ㄸ: '따-띻', ㄹ: '라-맇', ㅁ: '마-밓', ㅂ: '바-빟',
    ㅃ: '빠-삫', ㅅ: '사-싷', ㅆ: '싸-앃', ㅇ: '아-잏',
    ㅈ: '자-짛', ㅉ: '짜-찧', ㅊ: '차-칳', ㅋ: '카-킿',
    ㅌ: '타-팋', ㅍ: '파-핗', ㅎ: '하-힣',
  };

  if (![...query].every((character) => ranges[character])) return false;

  return new RegExp(
    [...query].map((character) => `[${ranges[character]}]`).join('.*'),
  ).test(text);
};

function EntryEditor({
  entry,
  onChange,
  onDelete,
}: {
  entry: Entry;
  onChange: (next: Entry) => void;
  onDelete: () => void;
}) {
  const field = (
    label: string,
    key: keyof Entry,
    placeholder: string,
    secureTextEntry = false,
  ) => (
    <View style={styles.formRow}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={(entry[key] as string | undefined) ?? ''}
        onChangeText={(text) => onChange({ ...entry, [key]: text })}
        placeholder={placeholder}
        placeholderTextColor="#A0A0A0"
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
    </View>
  );

  return (
    <View style={styles.editorCard}>
      {field('이름', 'title', '예: 네이버')}
      {field('id', 'username', '예: name@example.com')}
      {field('pw', 'password', '비밀번호', true)}
      {field('별칭', 'aliases', '예: naver · 네이버 · nid')}

      <Pressable
        onPress={() =>
          onChange({ ...entry, alwaysVisible: !entry.alwaysVisible })
        }
        style={styles.visibilitySetting}
      >
        <Text style={styles.check}>{entry.alwaysVisible ? '✓' : ' '}</Text>
        <Text style={styles.visibilityText}>
          비밀번호를 목록에서 항상 표시
        </Text>
      </Pressable>

      <Pressable onPress={onDelete} style={styles.deleteButton}>
        <Text style={styles.deleteText}>이 항목 삭제</Text>
      </Pressable>
    </View>
  );
}

export default function App() {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [shownPasswords, setShownPasswords] = useState<Set<string>>(
    new Set(),
  );
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [importOpen, setImportOpen] = useState(false);

  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2200);
  };

  const filteredEntries = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return entries;

    return entries.filter((entry) => {
      const searchable = `${entry.title} ${entry.username ?? ''} ${entry.aliases ?? ''}`;

      return (
        normalize(searchable).includes(normalizedQuery) ||
        matchesInitials(entry.title, query)
      );
    });
  }, [entries, query]);

  const copy = async (value: string | undefined, label: string) => {
    if (!value) return;

    await Clipboard.setStringAsync(value);
    showNotice(`${label}을(를) 복사했습니다 · 60초 후 삭제됩니다`);

    setTimeout(async () => {
      const current = await Clipboard.getStringAsync();

      if (current === value) {
        await Clipboard.setStringAsync('');
      }
    }, 60_000);
  };

  const addEntry = () => {
    setEntries((current) => [
      ...current,
      {
        id: `${Date.now()}`,
        title: '',
        username: '',
        password: '',
        aliases: '',
      },
    ]);
  };

  const deleteEntry = (id: string) => {
    Alert.alert(
      '항목을 삭제할까요?',
      '이 프로토타입에서는 삭제 후 되돌릴 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () =>
            setEntries((current) =>
              current.filter((entry) => entry.id !== id),
            ),
        },
      ],
    );
  };

  const copyAll = () => {
    const content = entries
      .map((entry) =>
        [
          entry.title,
          entry.username && `id: ${entry.username}`,
          entry.password && `pw: ${entry.password}`,
          entry.aliases,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n');

    Alert.alert(
      '전체 메모를 복사할까요?',
      '숨긴 비밀번호를 포함한 전체 내용이 클립보드에 복사됩니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '복사', onPress: () => void copy(content, '전체 메모') },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
      >
        <View style={styles.header}>
          <Text style={styles.appTitle}>개인 목록</Text>

          <Pressable onPress={() => setEditing((value) => !value)}>
            <Text style={styles.modeButton}>{editing ? '완료' : '편집'}</Text>
          </Pressable>
        </View>

        {!editing && (
          <View style={styles.searchWrap}>
            <Text style={styles.searchIcon}>⌕</Text>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="무엇을 찾으세요?"
              placeholderTextColor="#8B8B8B"
              autoCorrect={false}
              style={styles.searchInput}
            />

            {query.length > 0 && (
              <Text style={styles.resultCount}>{filteredEntries.length}</Text>
            )}
          </View>
        )}

        {editing ? (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <EntryEditor
                entry={item}
                onChange={(next) =>
                  setEntries((current) =>
                    current.map((entry) =>
                      entry.id === next.id ? next : entry,
                    ),
                  )
                }
                onDelete={() => deleteEntry(item.id)}
              />
            )}
            ListFooterComponent={
              <>
                <Pressable onPress={addEntry} style={styles.addButton}>
                  <Text style={styles.addText}>＋ 새 내용 작성</Text>
                </Pressable>

                <Pressable
                  onPress={() => setImportOpen(true)}
                  style={styles.secondaryButton}
                >
                  <Text style={styles.secondaryText}>기존 메모 가져오기</Text>
                </Pressable>

                <Pressable onPress={copyAll} style={styles.secondaryButton}>
                  <Text style={styles.secondaryText}>전체 메모 복사</Text>
                </Pressable>
              </>
            }
          />
        ) : (
          <FlatList
            data={filteredEntries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={styles.empty}>찾는 정보가 없습니다.</Text>
            }
            renderItem={({ item }) => {
              const visible =
                item.alwaysVisible || shownPasswords.has(item.id);

              return (
                <View style={styles.entry}>
                  <Text style={styles.entryTitle}>
                    {item.title || '제목 없음'}
                  </Text>

                  {!!item.username && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>id</Text>
                      <Text numberOfLines={1} style={styles.detailValue}>
                        {item.username}
                      </Text>

                      <Pressable
                        onPress={() =>
                          void copy(item.username, `${item.title} 아이디`)
                        }
                        style={styles.iconButton}
                      >
                        <Text style={styles.iconText}>⧉</Text>
                      </Pressable>
                    </View>
                  )}

                  {!!item.password && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>pw</Text>

                      <Text numberOfLines={1} style={styles.detailValue}>
                        {visible ? item.password : '••••••••••••••••'}
                      </Text>

                      <Pressable
                        onPress={() =>
                          setShownPasswords((current) => {
                            const next = new Set(current);

                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);

                            return next;
                          })
                        }
                        style={styles.iconButton}
                      >
                        <Text style={styles.eyeText}>
                          {visible ? '⊘' : '◉'}
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          void copy(item.password, `${item.title} 비밀번호`)
                        }
                        style={styles.iconButton}
                      >
                        <Text style={styles.iconText}>⧉</Text>
                      </Pressable>
                    </View>
                  )}

                  {!!item.aliases && (
                    <Text style={styles.aliases}>{item.aliases}</Text>
                  )}
                </View>
              );
            }}
          />
        )}

        {!!notice && (
          <Pressable onPress={() => setNotice('')} style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        )}
      </KeyboardAvoidingView>
      <ImportMemoModal
          visible={importOpen}
          onClose={() => setImportOpen(false)}
          onImport={(incoming: ImportedEntry[]) => {
            setEntries((current) => [
              ...current,
              ...incoming.map((entry, index) => ({
                id: `import-${Date.now()}-${index}`,
                title: entry.title,
                username: entry.username,
                password: entry.password,
                aliases: entry.aliases,
                alwaysVisible: entry.alwaysVisible,
              })),
            ]);

            setImportOpen(false);
            setEditing(false);
            showNotice(`${incoming.length}개 항목을 추가했습니다`);
          }}
        />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    height: 58,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  appTitle: {
    color: '#171717',
    fontSize: 20,
    fontWeight: '700',
  },

  modeButton: {
    color: '#2362D6',
    fontSize: 16,
    fontWeight: '700',
  },

  searchWrap: {
    height: 42,
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: '#F1F2F4',
    flexDirection: 'row',
    alignItems: 'center',
  },

  searchIcon: {
    color: '#555',
    fontSize: 22,
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    color: '#1B1B1B',
    fontSize: 16,
  },

  resultCount: {
    color: '#717171',
    fontSize: 14,
  },

  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },

  entry: {
    paddingVertical: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D8D8D8',
  },

  entryTitle: {
    color: '#171717',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },

  detailRow: {
    minHeight: 29,
    flexDirection: 'row',
    alignItems: 'center',
  },

  detailLabel: {
    width: 31,
    color: '#777',
    fontSize: 14,
    fontWeight: '700',
  },

  detailValue: {
    flex: 1,
    color: '#2A2A2A',
    fontSize: 15,
  },

  iconButton: {
    width: 33,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },

  iconText: {
    color: '#4A4A4A',
    fontSize: 20,
  },

  eyeText: {
    color: '#4A4A4A',
    fontSize: 17,
  },

  aliases: {
    marginTop: 6,
    color: '#858585',
    fontSize: 13,
  },

  empty: {
    textAlign: 'center',
    color: '#8A8A8A',
    paddingTop: 56,
    fontSize: 15,
  },

  editorCard: {
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DADADA',
    borderRadius: 12,
    backgroundColor: '#FCFCFC',
  },

  formRow: {
    marginBottom: 12,
  },

  formLabel: {
    marginBottom: 5,
    color: '#6F6F6F',
    fontSize: 13,
    fontWeight: '700',
  },

  input: {
    minHeight: 39,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F0F1F3',
    color: '#1A1A1A',
    fontSize: 16,
  },

  visibilitySetting: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },

  check: {
    width: 20,
    height: 20,
    marginRight: 8,
    textAlign: 'center',
    color: '#FFF',
    backgroundColor: '#2362D6',
    borderRadius: 5,
    fontWeight: '800',
  },

  visibilityText: {
    color: '#444',
    fontSize: 14,
  },

  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 16,
  },

  deleteText: {
    color: '#C9372C',
    fontSize: 14,
    fontWeight: '700',
  },

  addButton: {
    marginTop: 16,
    paddingVertical: 15,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#E8F0FF',
  },

  addText: {
    color: '#2362D6',
    fontSize: 16,
    fontWeight: '700',
  },

  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },

  secondaryText: {
    color: '#555',
    fontSize: 15,
    fontWeight: '600',
  },

  notice: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    paddingHorizontal: 15,
    paddingVertical: 13,
    borderRadius: 11,
    backgroundColor: '#222',
  },

  noticeText: {
    color: '#FFF',
    fontSize: 14,
    textAlign: 'center',
  },
});