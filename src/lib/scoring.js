const QUESTION_STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'being',
  'between',
  'both',
  'could',
  'during',
  'each',
  'even',
  'from',
  'into',
  'made',
  'make',
  'more',
  'most',
  'much',
  'must',
  'only',
  'other',
  'over',
  'some',
  'such',
  'than',
  'that',
  'then',
  'there',
  'their',
  'them',
  'these',
  'they',
  'this',
  'those',
  'through',
  'using',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'within',
  'would',
  'your',
  'yours',
  'you',
  'answer',
  'question',
  'prompt',
  'explain',
  'compare',
  'contrast',
  'evaluate',
  'describe',
  'analyse',
  'analyze',
  'assess',
  'calculate',
  'justify',
  'discuss',
  'outline',
  'state',
  'identify',
  'name',
  'define',
  'summarise',
  'summarize',
  'show',
  'work',
  'working',
  'reason',
  'reasons',
  'why',
  'how',
  'give',
  'list',
  'find',
  'determine',
  'prove',
  'say',
  'tell',
])

const PROMPT_FAMILIES = [
  {
    id: 'explain',
    label: 'Explain',
    questionPattern: /\b(explain|why|how(?:\s+(?:does|do|is|are))?|cause|causes|reason|reasons|because)\b/i,
    responsePattern: /\b(because|therefore|as a result|this shows|which means|so|since|due to|hence)\b/i,
  },
  {
    id: 'compare',
    label: 'Compare',
    questionPattern: /\b(compare|contrast|compare and contrast|similarities?|differences?|in contrast|whereas|while|both)\b/i,
    responsePattern: /\b(both|whereas|while|however|similarly|in contrast|difference|differences?|similar(?:ly)?|on the other hand)\b/i,
  },
  {
    id: 'evaluate',
    label: 'Evaluate',
    questionPattern: /\b(evaluate|assess|judge|judgement|judgment|to what extent|how far|weigh up)\b/i,
    responsePattern: /\b(overall|judgement|judgment|however|although|balance|weigh|more important|to a large extent|in conclusion)\b/i,
  },
  {
    id: 'describe',
    label: 'Describe',
    questionPattern: /\b(describe|outline|state|identify|name|give|what is|which is|list)\b/i,
    responsePattern: /\b(there is|there are|it is|shown by|has|contains|includes|features|is called|refers to|consists of)\b/i,
  },
  {
    id: 'analyse',
    label: 'Analyse',
    questionPattern: /\b(analyse|analyze|discuss|justify|summarise|summarize|interpret)\b/i,
    responsePattern: /\b(because|therefore|suggests|implies|shows|leads to|evidence|overall|in summary|on the other hand)\b/i,
  },
  {
    id: 'calculate',
    label: 'Calculate',
    questionPattern: /\b(calculate|work out|determine|find|show that|complete the calculation)\b/i,
    responsePattern: /\b(\d|=|×|÷|working|formula|equation|substitut|solve|step(?:s)?|final answer)\b/i,
  },
]

function normaliseText(value) {
  return String(value ?? '').trim()
}

function extractKeywords(text) {
  const words = normaliseText(text).toLowerCase().match(/\b[a-z0-9]{2,}\b/g) ?? []
  return words.filter((word) => !QUESTION_STOPWORDS.has(word) && !/^\d+$/.test(word))
}

function detectPromptFamily(questionText) {
  const question = normaliseText(questionText)
  return PROMPT_FAMILIES.find((family) => family.questionPattern.test(question)) ?? null
}

function normalizeScoringOptions(input, legacyTopBand, legacyBoard = 'AQA') {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      questionText: input.questionText ?? '',
      answerText: input.answerText ?? '',
      topBand: Boolean(input.topBand),
      board: input.board || 'AQA',
    }
  }

  return {
    questionText: '',
    answerText: input ?? '',
    topBand: Boolean(legacyTopBand),
    board: legacyBoard || 'AQA',
  }
}

function buildQuestionAnalysis(questionText, answerText) {
  const question = normaliseText(questionText)
  const answer = normaliseText(answerText)
  const promptFamily = detectPromptFamily(question)
  const commandWord = promptFamily?.id ?? ''
  const questionKeywords = Array.from(
    new Set(extractKeywords(question).filter((keyword) => keyword !== commandWord)),
  )
  const answerKeywords = new Set(extractKeywords(answer))
  const matchedKeywords = questionKeywords.filter((keyword) => answerKeywords.has(keyword))
  const missingKeywords = questionKeywords.filter((keyword) => !answerKeywords.has(keyword))
  const usesCommandStyle = promptFamily ? promptFamily.responsePattern.test(answer) : false
  const keywordCoverage = questionKeywords.length ? matchedKeywords.length / questionKeywords.length : 0

  return {
    question,
    answer,
    questionKeywords,
    matchedKeywords,
    missingKeywords,
    commandWord,
    promptFamilyLabel: promptFamily?.label ?? '',
    usesCommandStyle,
    keywordCoverage,
  }
}

function getBoardSpecificFeedback(board, mode) {
  switch (board) {
    case 'AQA':
      return mode === 'essay'
        ? 'AQA focus on AO2 structure: keep each paragraph tightly linked to the question.'
        : 'AQA focus on method: show each calculation step clearly and label your working.'
    case 'Edexcel':
      return mode === 'essay'
        ? 'Edexcel evaluation requirement: make your judgement explicit and supported by evidence.'
        : 'Edexcel focus on method marks: keep substitutions and calculations easy to follow.'
    case 'OCR':
      return mode === 'essay'
        ? 'OCR focus: balance evidence, explanation, and judgement across your response.'
        : 'OCR focus on accuracy: show the working trail and include the final conclusion clearly.'
    case 'WJEC':
      return mode === 'essay'
        ? 'Ensure your points specifically address the WJEC assessment objectives for your subject.'
        : 'WJEC math/science marking values clear step-by-step methodology.'
    case 'CCEA':
      return mode === 'essay'
        ? 'CCEA structure: clearly signpost your assessment objectives (AO1/AO2/AO3) within your answer.'
        : 'CCEA method marks: show your working clearly and ensure your final answer stands out.'
    default:
      return 'Keep your response aligned to the question and show your reasoning clearly.'
  }
}

export function scoreEssay(options = {}, legacyTopBand, legacyBoard = 'AQA') {
  const { questionText, answerText, topBand, board } = normalizeScoringOptions(
    options,
    legacyTopBand,
    legacyBoard,
  )
  const text = normaliseText(answerText)
  const questionAnalysis = buildQuestionAnalysis(questionText, text)

  if (!text) {
    return {
      maxMarks: 6,
      score: 0,
      ao1: ['You are ready to start — paste a student response and we will help shape it into stronger AO1 evidence.'],
      ao2: ['Even a short answer is enough to begin; adding more detail will unlock clearer AO2 feedback.'],
      ao3: ['Once the response is pasted in, we can point out where judgement and evaluation can be strengthened.'],
      summary: topBand
        ? 'Top Band mode works best once an essay response is pasted in.'
        : 'Paste a response and we will give you encouraging, step-by-step essay feedback.',
    }
  }

  const length = text.split(/\s+/).filter(Boolean).length
  const paragraphBreaks = (text.match(/\n\s*/g) ?? []).length
  const ao1 = []
  const ao2 = []
  const ao3 = []
  const pushUniqueFeedback = (feedbackList, message) => {
    if (message && !feedbackList.includes(message)) {
      feedbackList.push(message)
    }
  }
  let score = 0

  const hasAdequateLength = length >= 60
  const hasSustainedDevelopment = length >= 120
  const hasEvidenceDetail = /\b(example|examples|evidence|quote|quotes|statistic|statistics|fact|facts|terminology|term|terms|detail|specific|specifically|context)\b/i.test(text)
  const hasReasoning = /\b(because|therefore|this shows|consequently|as a result|proves|suggests)\b/i.test(text)
  const hasEvaluation = /\b(however|although|overall|on the other hand|ultimately|to a large extent|judgement)\b/i.test(text)
  const hasStructure = paragraphBreaks >= 1

  if (hasAdequateLength) {
    ao1.push('There is enough detail here to assess the main ideas.')
  } else if (length > 0) {
    pushUniqueFeedback(ao1, 'Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  }

  if (hasEvidenceDetail) {
    ao1.push('You are using specific evidence, examples, or terminology, which strengthens AO1.')
    score += 1
  } else {
    pushUniqueFeedback(ao1, 'Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  }

  if (hasReasoning) {
    ao2.push('You are explaining ideas and linking evidence to your point, which supports AO2.')
    score += 1
  } else {
    ao2.push('Develop analysis by explaining how and why the evidence matters.')
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'essay')
  if (boardSpecificFeedback) {
    ao2.push(boardSpecificFeedback)
  }

  if (questionAnalysis.questionKeywords.length) {
    const matchedSnippet = questionAnalysis.matchedKeywords.slice(0, 3).join(', ')
    const missingSnippet = questionAnalysis.missingKeywords.slice(0, 3).join(', ')

    if (questionAnalysis.matchedKeywords.length >= 2 || questionAnalysis.keywordCoverage >= 0.35) {
      score += 1
      ao2.push(
        matchedSnippet
          ? `Question-aware check: key terms such as ${matchedSnippet} appear in the answer.`
          : 'Question-aware check: the answer uses key terms from the prompt, which keeps it focused.',
      )
    } else {
      ao2.push(
        missingSnippet
          ? `Question-aware check: bring in more prompt terms such as ${missingSnippet} so the response stays on task.`
          : 'Question-aware check: use more of the question wording so the response stays on task.',
      )
    }
  }

  if (hasEvaluation) {
    ao3.push('There is some evaluation or judgement, which helps the top bands.')
    score += 1
  } else {
    ao3.push('Add a clear judgement or comparison to reach stronger AO3 levels.')
  }

  if (questionAnalysis.commandWord) {
    if (questionAnalysis.usesCommandStyle) {
      score += 1
      ao3.push(
        `The question asks you to ${questionAnalysis.commandWord}, and your response shows that style clearly.`,
      )
    } else {
      ao3.push(
        `The question asks you to ${questionAnalysis.commandWord}, so add more of the matching style (reasoning, comparison, or evaluation).`,
      )
    }
  }

  if (hasStructure) {
    ao3.push('Good paragraph structure identified.')
    score += 1
  } else {
    ao3.push('Consider using paragraph breaks to improve the structure of your essay.')
  }

  if (hasSustainedDevelopment) {
    ao3.push('Sustained development across the response helps to secure the top band.')
    if (topBand) {
      ao3.push('Top Band mode: add a sharp final judgement, embed precise terminology, and make every paragraph move the argument forward.')
      ao2.push('Top Band mode: use linked chains of reasoning and compare alternatives instead of listing points.')
      ao3.push('Top Band mode: refine paragraph sequencing, counterargument, and conclusion flow to maximise impact.')
    }
  } else if (hasAdequateLength) {
    ao3.push('Your answer has enough detail to assess, but it needs more sustained development to reach the top band.')
  } else if (topBand) {
    ao3.push('Top Band feedback unlocks best when the essay is more fully developed (around 120 words or more).')
  }

  return {
    maxMarks: 6,
    score: Math.min(score, 6),
    ao1,
    ao2,
    ao3,
    summary: topBand
      ? hasSustainedDevelopment
        ? 'Grade 9 / Top Band focus: make every paragraph precise, conceptual, and evaluative.'
        : hasAdequateLength
          ? 'Top Band mode is on, but this response needs more sustained development (120+ words) before full top-band feedback applies.'
          : 'Top Band mode is on, but this response is still too brief for full top-band feedback.'
      : questionAnalysis.questionKeywords.length
        ? 'Focus on specific knowledge, explanation, and staying aligned to the question.'
        : 'Focus on specific knowledge, explanation, and a clear conclusion.',
  }
}

export function scoreMathsScience(options = {}, legacyTopBand, legacyBoard = 'AQA') {
  const { questionText, answerText, topBand, board } = normalizeScoringOptions(
    options,
    legacyTopBand,
    legacyBoard,
  )
  const text = normaliseText(answerText)
  const questionAnalysis = buildQuestionAnalysis(questionText, text)

  if (!text) {
    return {
      maxMarks: 9,
      score: 0,
      ao1: ['You are ready to begin — paste the working or final answer and we will help identify the method marks.'],
      ao2: ['A few steps are enough to start; adding them will make the process feedback more precise.'],
      ao3: ['Once the answer is in, we can point out the units, scientific idea, or conclusion that will strengthen the response.'],
      summary: topBand
        ? 'Top Band mode works best once a maths/science response is pasted in.'
        : 'Paste working or an answer and we will give you encouraging method-mark feedback.',
      extra: [],
    }
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const methodMarks = []
  const addMethodMark = (message) => {
    if (message && !methodMarks.includes(message)) {
      methodMarks.push(message)
    }
  }

  let score = 0
  const hasVisibleCalculation = /(?:\d+(?:\.\d+)?\s*[+\-×÷^]\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*=\s*\d+(?:\.\d+)?|=>|→)/.test(text)
  const hasProcessLanguage = /\b(substitut(e|ion)|calculate|show\s+(?:your\s+work|the\s+working|working(?:\s+out)?)|working(?:\s+out)?|step(?:s)?|solve|method|equation|formula|check|verify|verified|recheck|recalculate|ans|units)\b|→|=>/i.test(text)
  const hasWorkingTrail = lines.length >= 2 && (hasVisibleCalculation || hasProcessLanguage)
  const hasMethodTrace = hasVisibleCalculation || hasProcessLanguage
  const hasFormulaReference = /\b(formula|equation|substitut(e|ion)|calculation|ratio|proportion|graph|table|method)\b/i.test(text)
  const hasUnits = /\b(cm|mm|kg|g|mol|dm\^?3|°c|units|ans)\b|(\d+\s*(m|s|n|j|w)\b)/i.test(text)
  const hasConclusion = /\b(therefore|consequently|ultimately|hence|which means|final answer|in conclusion|ans)\b/i.test(text)
  const hasConceptualDetail = /\b(force|energy|mass|velocity|acceleration|reaction|atom|cell|graph|ratio|probability|mean|median|area|volume|gradient|current|voltage|resistance|density|wave|frequency|temperature|power|percentage|speed|distance|time|fraction|equation|function)\b/i.test(text)
  const hasVerification = /\b(check|checked|verify|verified|recheck|sensible|reasonable|plausible|substitut(e|ion)\s+back|back-substitute|sanity check)\b/i.test(text)
  const hasPromptFocus = questionAnalysis.questionKeywords.length
    ? questionAnalysis.matchedKeywords.length >= 2 || questionAnalysis.keywordCoverage >= 0.35
    : false
  const hasSustainedReasoning = text.length >= 100

  if (hasWorkingTrail) {
    score += 2
    addMethodMark('You show more than one line of working, which is good evidence for method marks.')
  } else if (hasMethodTrace) {
    score += 1
    addMethodMark('Show the steps you used, not just the final answer.')
  } else if (hasFormulaReference) {
    score += 1
    addMethodMark('You reference formulas, equations, or a calculation path, which helps show method.')
  } else {
    addMethodMark('Use equations, substitutions, or calculation steps to earn method marks.')
  }

  if (hasUnits) {
    score += 1
    addMethodMark('You have included units or scientific measurement language.')
  } else {
    addMethodMark('Include units where needed and keep the final answer contextualised.')
  }

  if (hasConclusion) {
    score += 1
    addMethodMark('Detected markers for a conclusion or final answer, which is key for top marks.')
  }

  if (hasConceptualDetail) {
    score += 1
    addMethodMark('You include topic vocabulary or scientific context, which helps demonstrate understanding.')
  }

  if (hasVerification) {
    score += 1
    addMethodMark('You check or verify the result, which strengthens the method trail.')
  }

  if (hasPromptFocus) {
    score += 1
    const matchedSnippet = questionAnalysis.matchedKeywords.slice(0, 3).join(', ')
    addMethodMark(
      matchedSnippet
        ? `Question-aware check: you reuse key terms such as ${matchedSnippet}, which keeps the working on task.`
        : 'Question-aware check: you reuse key terms from the prompt, which keeps the working on task.',
    )
  } else if (questionAnalysis.questionKeywords.length) {
    const missingSnippet = questionAnalysis.missingKeywords.slice(0, 3).join(', ')
    addMethodMark(
      missingSnippet
        ? `Question-aware check: use more of the prompt wording such as ${missingSnippet} so the method stays focused.`
        : 'Question-aware check: use more of the prompt wording so the method stays focused.',
    )
  }

  if (hasSustainedReasoning) {
    score += 1
    addMethodMark('Your response is long enough to show a fuller chain of reasoning.')
    if (topBand) {
      addMethodMark('Top Band mode: show a full chain of reasoning, label substitutions, and check the answer against sensible values.')
    }
  } else if (topBand) {
    addMethodMark('Top Band feedback unlocks best when the answer is more fully developed (over 100 words).')
  }

  if (questionAnalysis.commandWord) {
    if (questionAnalysis.usesCommandStyle) {
      score += 1
      addMethodMark(`The prompt asks you to ${questionAnalysis.commandWord}, and your response shows that process clearly.`)
    } else {
      addMethodMark(`The prompt asks you to ${questionAnalysis.commandWord}, so make that method style more obvious in your working.`)
    }
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'maths_science')
  if (boardSpecificFeedback) {
    addMethodMark(boardSpecificFeedback)
  }

  return {
    maxMarks: 9,
    score: Math.min(score, 9),
    ao1: ['Method marks are awarded for the steps, working, and correct structure you show.'],
    ao2: ['Explain each step clearly, especially when moving from formula to substitution to answer.'],
    ao3: ['If this is a science question, include the key scientific idea, correct units, and any required conclusion.'],
    summary: topBand
      ? 'Top Band mode: maximise the working trail and annotate every step.'
      : questionAnalysis.questionKeywords.length
        ? 'Method marks focus on visible working, correct process, and staying aligned to the question.'
        : 'Method marks focus on visible working and correct process.',
    extra: methodMarks,
  }
}
