import './style.css'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { useLocalStorage, useMount } from 'react-use'
import { difference } from 'lodash-es'
import { createRoot } from 'react-dom/client'
import clsx from 'clsx'
import { onMessage } from '../model/messaging'
import { useEffect, useState, useReducer } from 'react'

interface ButtonsState {
  [key: string]: boolean;
}

function getMarkerSize(partNum: number, totalParts: number): number {
  return `[START PART ${partNum}/${totalParts}]\n\n[END PART ${partNum}/${totalParts}]`.length;
}

function useChunks(text: string, limit: number | undefined) {
  let emptyStringArray: string[] = [];
  const [chunks, setChunks] = useState(emptyStringArray)
  
  useEffect(() => {
    if (text.trim().length === 0 || !limit || limit === 0) {
      setChunks([])
      return
    }

    const createChunks = async () => {
      // First pass: Get an estimate of chunks using full limit
      const estimateSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: limit,
        chunkOverlap: 0,
        separators: difference(
          RecursiveCharacterTextSplitter.getSeparatorsForLanguage('markdown'),
          ['\n\n***\n\n', '\n\n---\n\n', '\n\n___\n\n'],
        ),
      });

      const estimatedChunks = await estimateSplitter.splitText(text);
      const numChunks = estimatedChunks.length;
      
      // Calculate marker size for the estimated number of chunks
      const markerSize = getMarkerSize(numChunks, numChunks);
      
      // Second pass: Adjust chunk size to account for markers
      const adjustedLimit = limit - markerSize;
      
      if (adjustedLimit <= 0) {
        console.error('Limit too small after accounting for markers');
        setChunks([]);
        return;
      }

      const finalSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: adjustedLimit,
        chunkOverlap: 0,
        separators: difference(
          RecursiveCharacterTextSplitter.getSeparatorsForLanguage('markdown'),
          ['\n\n***\n\n', '\n\n---\n\n', '\n\n___\n\n'],
        ),
      });

      const finalChunks = await finalSplitter.splitText(text);
      
      // Verify that chunks with markers will fit within limit
      const actualMarkerSize = getMarkerSize(finalChunks.length, finalChunks.length);
      const isValid = finalChunks.every(chunk => 
        (chunk.length + actualMarkerSize) <= limit
      );

      if (!isValid) {
        console.error('Some chunks would exceed limit with markers');
        // If needed, we could do another pass with a smaller limit
        setChunks([]);
        return;
      }

      setChunks(finalChunks);
    }

    createChunks();
  }, [text, limit])
  
  return chunks
}

function App() {
  const [text, setText] = useState('')
  const [limit, setLimit] = useLocalStorage('CHATGPT_SPLITTER_CHUNK_LIMIT', 0)
  const chunks = useChunks(text, limit)
  const [buttonsState, setButtonsState] = useState<ButtonsState>({})
  const [hide, toggle] = useReducer((state) => !state, true)

  useEffect(() => {
    const initialState: ButtonsState = {};
    chunks.forEach((_, index) => {
      initialState[`button_${index}`] = false;
    });
    setButtonsState(initialState);
  }, [chunks]);

  const disableButton = (id: string) => {
    setButtonsState(prevState => ({
      ...prevState,
      [id]: true
    }));
  };

  function formatChunkWithParts(chunk: string, index: number, total: number): string {
    return `[START PART ${index + 1}/${total}]\n${chunk}\n[END PART ${index + 1}/${total}]`;
  }

  function copyToClipboard(chunk: string, index: number) {
    const formattedChunk = formatChunkWithParts(chunk, index, chunks.length);
    navigator.clipboard.writeText(formattedChunk).then(() => {
      disableButton(`button_${index}`);
    });
  }

  useMount(() => {
    onMessage('toggle', toggle)
  })

  return (
    <div
      className={clsx('fixed right-0 w-1/4 max-w-sm', { hidden: hide })}
      style={{
        top: '4rem',
      }}
    >
      <div
        className={
          'relative bg-white text-black dark:bg-gray-700 dark:text-white p-4 rounded-md'
        }
      >
        <div>
          <label className={'font-bold size-6'}>LLM Splitter</label>
          <textarea
            value={text}
            onInput={(ev) => {
              setText((ev.target as HTMLTextAreaElement).value)
            }}
            rows={10}
            className={
              'bg-white text-black dark:bg-gray-700 dark:text-white w-full border border-gray-300 rounded-md p-2 outline-none'
            }
          ></textarea>
        </div>
        
        <div className={'mb-2'}>
          <div>
            <label id={'limit'} className={'flex justify-between'}>
              <span>Split Limit:</span>
              <span className={'text-gray-300'}>
                chunks: {chunks.length}
                {chunks.length > 0 && ` (markers: ${getMarkerSize(chunks.length, chunks.length)})`}
              </span>
            </label>
          </div>
          <input
            id={'limit'}
            type={'number'}
            min={50}  // Minimum reasonable size for a chunk + markers
            value={limit}
            onChange={(ev) =>
              setLimit(Number.parseInt((ev.target as HTMLInputElement).value))
            }
            className={
              'bg-white text-black dark:bg-gray-700 dark:text-white border border-gray-300 rounded-md p-2'
            }
          ></input>
        </div>

        <div>
          {chunks.map((chunk, index) => (
            <div key={index} className={'mb-2'}>
              <button
                className={clsx(
                  'rounded px-4 py-1 mt-2 transition-colors duration-200',
                  buttonsState[`button_${index}`]
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
                )}
                onClick={() => copyToClipboard(chunk, index)}
                disabled={buttonsState[`button_${index}`]}
              >
                Copy {index + 1} / {chunks.length}
              </button>
            </div>
          ))}
        </div>

        <button onClick={toggle} className={'absolute right-0 top-0 p-2'}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className={'w-4 h-4'}
          >
            <path
              d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}


export default defineContentScript({
  matches: ["<all_urls>"],
  cssInjectionMode: 'ui',
  main(ctx) {
    console.log('Hello content.')

    async function onCreateModal() {
      const ui = await createShadowRootUi(ctx, {
        name: 'chatgpt-splitter',
        position: 'inline',
        onMount: (container) => {
          const app = document.createElement('div')
          container.append(app)

          // Create a root on the UI container and render a component
          const root = createRoot(app)
          root.render(<App />)
          return root
        },
        onRemove(root) {
          // Unmount the root when the UI is removed
          root?.unmount()
        },
      })
      ui.mount()
    }

    onCreateModal()
  },
})