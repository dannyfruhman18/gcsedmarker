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
    default:
      return 'Keep your response aligned to the question and show your reasoning clearly.'
  }
}

export function scoreEssay(answer, topBand, board = 'AQA') {
  const text = typeof answer === 'string' ? answer.trim() : ''

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
  const paragraphBreaks = (text.match(/\n\s*\n/g) ?? []).length
  const ao1 = []
  const ao2 = []
  const ao3 = []
  let score = 0

  if (length >= 80) {
    ao1.push('Clear subject knowledge shown with enough developed detail to reward.')
    score += 1
  } else if (length > 0) {
    ao1.push('Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  }

  if (/\b(because|therefore|this shows|consequently|as a result|proves|suggests)\b/i.test(text)) {
    ao2.push('You are explaining ideas and linking evidence to your point, which supports AO2.')
    score += 1
  } else {
    ao2.push('Develop analysis by explaining how and why the evidence matters.')
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'essay')
  if (boardSpecificFeedback) {
    ao2.push(boardSpecificFeedback)
  }

  if (/\b(however|although|overall|on the other hand|ultimately|to a large extent|judgement)\b/i.test(text)) {
    ao3.push('There is some evaluation or judgement, which helps the top bands.')
    score += 1
  } else {
    ao3.push('Add a clear judgement or comparison to reach stronger AO3 levels.')
  }

  if (paragraphBreaks >= 2) {
    ao3.push('Good paragraph structure identified.')
  } else {
    ao3.push('Consider using paragraph breaks to improve the structure of your essay.')
  }

  if (topBand) {
    if (length > 150) {
      score += 1
      ao3.push('Top Band mode: add a sharp final judgement, embed precise terminology, and make every paragraph move the argument forward.')
      ao2.push('Top Band mode: use linked chains of reasoning and compare alternatives instead of listing points.')
      ao3.push('Top Band mode: refine paragraph sequencing, counterargument, and conclusion flow to maximise impact.')
    } else {
      ao3.push('Top Band feedback unlocks best when the essay is more fully developed (over 150 words). Add more detail and evaluation to push into the top band.')
    }
  }

  return {
    maxMarks: 6,
    score: Math.min(score, 6),
    ao1,
    ao2,
    ao3,
    summary: topBand
      ? length > 150
        ? 'Grade 9 / Top Band focus: make every paragraph precise, conceptual, and evaluative.'
        : 'Top Band mode is on, but this response needs more development (over 150 words) before full top-band feedback applies.'
      : 'Focus on specific knowledge, explanation, and a clear conclusion.',
  }
}

export function scoreMathsScience(answer, topBand, board = 'AQA') {
  const text = typeof answer === 'string' ? answer.trim() : ''

  if (!text) {
    return {
      maxMarks: 10,
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
    if (!methodMarks.includes(message)) {
      methodMarks.push(message)
    }
  }
  const marks = new Set()
  const hasMathSignals =
    /\d/.test(text) ||
    /[+\-*/=×÷^√→]/.test(text) ||
    /\b(substitut(e|ion)|calculate|solve|working(?:\s+out)?|show(?:\s+your\s+work|(?:\s+working)?)?|step(?:s)?|equation|formula)\b/i.test(text)
  const hasVisibleCalculation = /[+\-*/=×÷^√→]/.test(text)

  if (lines.length >= 2 && hasMathSignals) {
    marks.add('working')
    addMethodMark('You show more than one line of working, which is good evidence for method marks.')
  } else if (hasMathSignals) {
    addMethodMark('Show the steps you used, not just the final answer.')
    if (hasVisibleCalculation) {
      marks.add('working')
      addMethodMark('Your response includes visible calculation symbols, which can count as working if the chain of reasoning is clear.')
    }
  } else {
    addMethodMark('Use equations, substitutions, or calculation steps to earn method marks.')
  }

  if (/\b(substitut(e|ion)|calculate|show(?:\s+your\s+work|(?:\s+working)?)?|working(?:\s+out)?|step(?:s)?)\b|→|=>/i.test(text)) {
    marks.add('process')
    addMethodMark('Your response includes process language or a clear calculation trail.')
  } else {
    addMethodMark('Use equations, substitutions, or calculation steps to earn method marks.')
  }

  if (/\b(cm|mm|kg|g|mol|dm\^?3|°c)\b|(\d+\s*(m|s|n|j|w)\b)/i.test(text)) {
    marks.add('units')
    addMethodMark('You have included units or scientific measurement language.')
  } else {
    addMethodMark('Include units where needed and keep the final answer contextualised.')
  }

  const boardSpecificFeedback = getBoardSpecificFeedback(board, 'maths_science')
  if (boardSpecificFeedback) {
    addMethodMark(boardSpecificFeedback)
  }

  if (/\b(therefore|because|so|hence|which means|final answer)\b/i.test(text)) {
    marks.add('conclusion')
    addMethodMark('Detected markers for a conclusion or final answer, which is key for top marks.')
  }

  if (topBand && text.length >= 100) {
    marks.add('topband')
    addMethodMark('Top Band mode: show a full chain of reasoning, label substitutions, and check the answer against sensible values.')
  }

  const score = Math.min(marks.size, 10)

  return {
    maxMarks: 10,
    score,
    ao1: ['Method marks are awarded for the steps, working, and correct structure you show.'],
    ao2: ['Explain each step clearly, especially when moving from formula to substitution to answer.'],
    ao3: ['If this is a science question, include the key scientific idea, correct units, and any required conclusion.'],
    summary: topBand
      ? 'Top Band mode: maximise the working trail and annotate every step.'
      : 'Method marks focus on visible working and correct process.',
    extra: methodMarks,
  }
}
