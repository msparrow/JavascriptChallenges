import { useState, useEffect, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import './App.css';

interface Lesson {
  id: string;
  title: string;
  explanation: string;
  challenge: string;
  initialCode: string;
  validation?: string;
  tests?: TestCase[];
  hint: string;
}

interface TestCase {
  name: string;
  assertion: string; // JS that returns boolean
}

interface TestRunResult {
  passCount: number;
  totalCount: number;
  details: { name: string; passed: boolean; error?: string }[];
}

function App() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  // Glossary now permanent in right pane
  const [glossary, setGlossary] = useState<{ term: string; definition: string; example?: string }[]>([]);
  const [expandedGlossary, setExpandedGlossary] = useState<Record<number, boolean>>({});
  // Theming
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('ui-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });
  // Resizable layout state (percent widths)
  const [lessonWidthPct, setLessonWidthPct] = useState<number>(() => {
    const stored = localStorage.getItem('ui-lesson-width');
    return stored ? Number(stored) : 26;
  });
  const [previewWidthPct, setPreviewWidthPct] = useState<number>(() => {
    const stored = localStorage.getItem('ui-preview-width');
    return stored ? Number(stored) : 26;
  });
  const layoutRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}lessons.json`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        setLessons(data);
      })
      .catch(error => {
        console.error('Error fetching lessons:', error);
        setError(`Failed to load lessons. Check the browser console for more details.`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  //Test comment
  // Load glossary once
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}glossary.json`)
      .then(res => (res.ok ? res.json() : []))
      .then((items) => setGlossary(items))
      .catch(() => setGlossary([]));
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ui-theme', theme);
  }, [theme]);

  // Apply resizable widths as CSS variables
  useEffect(() => {
    const root = layoutRef.current;
    if (root) {
      root.style.setProperty('--lesson-width', `${lessonWidthPct}%`);
      root.style.setProperty('--preview-width', `${previewWidthPct}%`);
    }
    localStorage.setItem('ui-lesson-width', String(lessonWidthPct));
  }, [lessonWidthPct]);

  useEffect(() => {
    const root = layoutRef.current;
    if (root) {
      root.style.setProperty('--lesson-width', `${lessonWidthPct}%`);
      root.style.setProperty('--preview-width', `${previewWidthPct}%`);
    }
    localStorage.setItem('ui-preview-width', String(previewWidthPct));
  }, [previewWidthPct]);

  const toggleGlossary = (idx: number) => {
    setExpandedGlossary(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Load initial code from localStorage or default
  useEffect(() => {
    if (lessons.length > 0) {
      const savedCode = localStorage.getItem(`code-lesson-${lessons[currentLessonIndex].id}`);
      setCode(savedCode || lessons[currentLessonIndex].initialCode);
    }
  }, [currentLessonIndex, lessons]);

  // Save code to localStorage on change
  useEffect(() => {
    if (lessons.length > 0) {
      localStorage.setItem(`code-lesson-${lessons[currentLessonIndex].id}`, code);
    }
  }, [code, currentLessonIndex, lessons]);

  const handleCodeChange = useCallback((value: string) => {
    setCode(value);
  }, []);

  const handleRunCode = () => {
    const iframe = document.getElementById('preview') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      const lesson = lessons[currentLessonIndex];
      // Build test runner if tests exist; otherwise fall back to single validation
      const hasTests = Array.isArray(lesson.tests) && lesson.tests.length > 0;
      const testsArrayLiteral = hasTests
        ? `[${lesson.tests!.map(t => `{name:${JSON.stringify(t.name)}, fn:function(){ ${t.assertion} }}`).join(',')}]`
        : '[]';

      const fullScript = `
        try {
          ${code};
          const hasTests = ${String(hasTests)};
          if (hasTests) {
            const tests = ${testsArrayLiteral};
            const details = [];
            let passCount = 0;
            for (const t of tests) {
              try {
                const passed = (function(){ return t.fn(); })();
                if (passed) passCount += 1;
                details.push({ name: t.name, passed });
              } catch (err) {
                details.push({ name: t.name, passed: false, error: String(err && err.message ? err.message : err) });
              }
            }
            window.parent.postMessage({ type: 'testResults', payload: { passCount, totalCount: tests.length, details } }, '*');
          } else {
            const result = (function() { ${lesson.validation ?? 'return false;'} })();
            window.parent.postMessage({ type: 'result', payload: result ? 'Success! Correct!' : 'Keep trying! The validation failed.' }, '*');
          }
        } catch (e) {
          window.parent.postMessage({ type: 'result', payload: 'Error: ' + e.message }, '*');
        }
      `;
      iframe.contentWindow.postMessage({ script: fullScript }, '*');
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Enter to run code
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunCode();
        return;
      }
      // Alt+ArrowLeft/Right to navigate lessons
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPreviousLesson();
        return;
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goToNextLesson();
        return;
      }
      // t to toggle theme
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 't') {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRunCode]);

  // Splitter drag logic
  const startDrag = (which: 'left' | 'right', startEvent: React.MouseEvent<HTMLDivElement>) => {
    const container = layoutRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const containerWidth = rect.width;
    const startX = startEvent.clientX;
    const startingLesson = lessonWidthPct;
    const startingPreview = previewWidthPct;

    const onMove = (ev: MouseEvent) => {
      const deltaPx = ev.clientX - startX;
      const deltaPct = (deltaPx / containerWidth) * 100;
      if (which === 'left') {
        const next = Math.min(45, Math.max(15, startingLesson + deltaPct));
        setLessonWidthPct(next);
      } else {
        const next = Math.min(45, Math.max(15, startingPreview - deltaPct));
        setPreviewWidthPct(next);
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onSplitterKeyDown = (which: 'left' | 'right') => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 5 : 2;
    if (e.key === 'ArrowLeft') {
      if (which === 'left') setLessonWidthPct(v => Math.max(15, v - step));
      if (which === 'right') setPreviewWidthPct(v => Math.min(45, v + step));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      if (which === 'left') setLessonWidthPct(v => Math.min(45, v + step));
      if (which === 'right') setPreviewWidthPct(v => Math.max(15, v - step));
      e.preventDefault();
    }
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < lessons.length - 1) {
      const nextIndex = currentLessonIndex + 1;
      setCurrentLessonIndex(nextIndex);
      setResult('');
      setTestResult(null);
      setShowHint(false);
    }
  };

  const goToPreviousLesson = () => {
    if (currentLessonIndex > 0) {
      const prevIndex = currentLessonIndex - 1;
      setCurrentLessonIndex(prevIndex);
      setResult('');
      setTestResult(null);
      setShowHint(false);
    }
  };

  const handleLessonSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentLessonIndex(newIndex);
    setResult('');
    setTestResult(null);
    setShowHint(false);
  };

  const handleResetCode = () => {
    if (lessons.length > 0) {
      const currentLesson = lessons[currentLessonIndex];
      localStorage.removeItem(`code-lesson-${currentLesson.id}`);
      setCode(currentLesson.initialCode);
      setResult('Code has been reset.');
      setTestResult(null);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event || !event.data) return;
      if (event.data.type === 'result') {
        setTestResult(null);
        setResult(event.data.payload);
      } else if (event.data.type === 'testResults' && event.data.payload) {
        setResult('');
        setTestResult(event.data.payload as TestRunResult);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  if (loading) {
    return <div className="status-pane">Loading...</div>;
  }

  if (error) {
    return <div className="status-pane error-pane">{error}</div>;
  }

  if (lessons.length === 0) {
    return <div className="status-pane">No lessons found.</div>;
  }

  const lesson = lessons[currentLessonIndex];

  const base = import.meta.env.BASE_URL || '/';
  return (
    <div className="App" ref={layoutRef}>
      <header className="toolbar" role="banner">
        <div className="toolbar-left">
          <strong className="app-title">JavaScript Learning Platform</strong>
        </div>
        <div className="toolbar-right">
          <div className="kbd-hints" aria-hidden>
            <span title="Run (Ctrl/⌘+Enter)">Run ⌃⏎</span>
            <span title="Prev/Next (Alt+←/→)">Alt ←/→</span>
            <span title="Toggle Theme (T)">T</span>
          </div>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))}
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <div className="layout" role="main" aria-label="Learning workspace">
        <div className="lesson-pane" aria-label="Lesson content">
        <h1>{lesson.title}</h1>
        <p>{lesson.explanation}</p>
        <p><strong>Challenge:</strong> {lesson.challenge}</p>
        <div className="navigation-controls">
          <div className="navigation-buttons">
            <button onClick={goToPreviousLesson} disabled={currentLessonIndex === 0}>
              Previous
            </button>
            <button onClick={goToNextLesson} disabled={currentLessonIndex === lessons.length - 1}>
              Next
            </button>
          </div>
          <select className="lesson-dropdown" onChange={handleLessonSelect} value={currentLessonIndex}>
            {lessons.map((lesson, index) => (
              <option key={lesson.id} value={index}>
                {index + 1}. {lesson.title}
              </option>
            ))}
          </select>
        </div>
        <div className="challenge-actions">
          <button className="hint-button" onClick={() => setShowHint(!showHint)}>
            {showHint ? 'Hide Hint' : 'Show Hint'}
          </button>
        </div>
        {showHint && (
          <div className="hint-box">
            <p><strong>Hint:</strong> {lesson.hint}</p>
          </div>
        )}
          <div
            className="result"
            data-status={result.includes('Success') ? 'success' : result ? 'failure' : ''}
            aria-live="polite"
          >
            {result}
          </div>
          {testResult && (
            <div className={`result ${testResult.passCount === testResult.totalCount ? 'success' : 'failure'}`}>
              <div><strong>{testResult.passCount} / {testResult.totalCount}</strong> tests passed</div>
              <ul className="test-details">
                {testResult.details.map((d, i) => (
                  <li key={i} className={d.passed ? 'passed' : 'failed'}>
                    {d.passed ? '✔' : '✖'} {d.name}{d.error ? ` — ${d.error}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize lesson pane"
          tabIndex={0}
          onMouseDown={(e) => startDrag('left', e)}
          onKeyDown={onSplitterKeyDown('left')}
        />

        <div className="editor-pane" aria-label="Code editor">
          <div className="editor-scroll">
            <CodeMirror
              value={code}
              height="100%"
              extensions={[javascript({ jsx: true })]}
              theme={theme === 'dark' ? vscodeDark : vscodeLight}
              onChange={handleCodeChange}
            />
          </div>
          <div className="editor-actions">
            <button className="run-button" onClick={handleRunCode} title="Run (Ctrl/⌘+Enter)">Run Code</button>
            <button className="reset-button" onClick={handleResetCode}>Reset Code</button>
          </div>
        </div>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize glossary pane"
          tabIndex={0}
          onMouseDown={(e) => startDrag('right', e)}
          onKeyDown={onSplitterKeyDown('right')}
        />

        <div className="preview-pane" aria-label="Glossary">
          <div className="sidebar-header">
            <h2>Glossary</h2>
          </div>
          <div className="sidebar-body glossary-list">
            {glossary.length === 0 && <p>No glossary items found.</p>}
            {glossary.map((g, idx) => {
              const isOpen = !!expandedGlossary[idx];
              return (
                <div key={idx} className={`glossary-item ${isOpen ? 'open' : ''}`}>
                  <button className="glossary-header" onClick={() => toggleGlossary(idx)}>
                    <span className="term">{g.term}</span>
                    <span className={`chevron ${isOpen ? 'rot' : ''}`}>▾</span>
                  </button>
                  {isOpen && (
                    <div className="glossary-content">
                      <p className="definition">{g.definition}</p>
                      {g.example && (
                        <div className="code-block">
                          <pre><code>{g.example}</code></pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hidden runner iframe to execute code */}
      <iframe
        id="preview"
        src={`${base}iframe.html`}
        title="Hidden code runner"
        className="runner-iframe"
        aria-hidden
      />
    </div>
  );
}

export default App;