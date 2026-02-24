/**
 * Layout utility for flow visualizations
 * Handles CognitivePhrase graph layout
 */

const NODE_WIDTH = 280;
const NODE_HEIGHT = 160;

/**
 * Transform CognitivePhrase data to ReactFlow nodes and edges
 * Creates a horizontal graph: State -> IntentSequence -> State -> ...
 *
 * @param {object} phrase - CognitivePhrase object
 * @param {array} states - Array of State objects
 * @param {array} intentSequences - Array of IntentSequence objects
 * @param {Set} expandedNodeIds - Set of expanded node IDs
 * @param {function} onToggleExpand - Callback to toggle node expansion
 * @returns {object} { nodes, edges }
 */
export const transformCognitivePhraseData = (phrase, states, intentSequences, expandedNodeIds = new Set(), onToggleExpand = null) => {
    if (!phrase || !states || states.length === 0) {
        return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];

    // Build lookup maps
    const stateById = {};
    states.forEach(s => { stateById[s.id] = s; });

    const seqById = {};
    intentSequences.forEach(seq => { seqById[seq.id] = seq; });

    const PHRASE_NODE_WIDTH = 280;
    const PHRASE_NODE_HEIGHT = 120;
    const SEQ_NODE_WIDTH = 260;
    const SEQ_NODE_HEIGHT = 100;
    const H_GAP = 100;
    const V_GAP = 40;

    let currentX = 0;
    const baseY = 0;

    // Use execution_plan if available, otherwise fall back to state_path
    if (phrase.execution_plan && phrase.execution_plan.length > 0) {
        phrase.execution_plan.forEach((step, stepIndex) => {
            const state = stateById[step.state_id];
            if (!state) return;

            // Add State node
            const stateNodeId = `state-${step.state_id}`;
            nodes.push({
                id: stateNodeId,
                type: 'custom',
                data: {
                    label: state.page_title || state.description || state.page_url || 'Page',
                    description: state.description || state.page_url,
                    type: 'state',
                    nodeType: 'state'
                },
                position: { x: currentX, y: baseY }
            });

            // Connect from previous step's last element
            if (stepIndex > 0) {
                const prevStep = phrase.execution_plan[stepIndex - 1];
                // Find the last element of previous step
                let prevNodeId;
                if (prevStep.navigation_sequence_id) {
                    prevNodeId = `seq-${prevStep.navigation_sequence_id}`;
                } else if (prevStep.in_page_sequence_ids && prevStep.in_page_sequence_ids.length > 0) {
                    prevNodeId = `seq-${prevStep.in_page_sequence_ids[prevStep.in_page_sequence_ids.length - 1]}`;
                } else {
                    prevNodeId = `state-${prevStep.state_id}`;
                }

                edges.push({
                    id: `e-${prevNodeId}-${stateNodeId}`,
                    source: prevNodeId,
                    target: stateNodeId,
                    type: 'floating',
                    animated: true, // Navigation edges are animated
                    style: { stroke: '#10b981', strokeWidth: 2 },
                    markerEnd: { type: 'arrowclosed', color: '#10b981' }
                });
            }

            currentX += PHRASE_NODE_WIDTH + H_GAP;

            // Add in-page IntentSequence nodes (stacked vertically below state)
            let seqY = baseY;
            let lastInPageSeqId = null;

            step.in_page_sequence_ids.forEach((seqId, seqIndex) => {
                const seq = seqById[seqId];
                if (!seq) return;

                const seqNodeId = `seq-${seqId}`;
                const isExpanded = expandedNodeIds.has(seqNodeId);

                nodes.push({
                    id: seqNodeId,
                    type: 'custom',
                    data: {
                        label: seq.description || 'Action Sequence',
                        description: seq.intents?.map(i => i.text || i.type).join(' -> '),
                        type: 'intent_sequence',
                        nodeType: 'intent_sequence',
                        intents: seq.intents,
                        isExpanded,
                        onToggleExpand
                    },
                    position: { x: currentX, y: seqY }
                });

                // Connect State -> first in-page sequence
                if (seqIndex === 0) {
                    edges.push({
                        id: `e-${stateNodeId}-${seqNodeId}`,
                        source: stateNodeId,
                        target: seqNodeId,
                        type: 'floating',
                        style: { stroke: '#3b82f6', strokeWidth: 2 },
                        markerEnd: { type: 'arrowclosed', color: '#3b82f6' }
                    });
                } else if (lastInPageSeqId) {
                    // Connect previous in-page sequence to this one
                    edges.push({
                        id: `e-${lastInPageSeqId}-${seqNodeId}`,
                        source: lastInPageSeqId,
                        target: seqNodeId,
                        type: 'floating',
                        style: { stroke: '#3b82f6', strokeWidth: 2 },
                        markerEnd: { type: 'arrowclosed', color: '#3b82f6' }
                    });
                }

                lastInPageSeqId = seqNodeId;
                seqY += SEQ_NODE_HEIGHT + V_GAP;
            });

            // If there are in-page sequences, advance X
            if (step.in_page_sequence_ids.length > 0) {
                currentX += SEQ_NODE_WIDTH + H_GAP;
            }

            // Add navigation IntentSequence if exists
            if (step.navigation_sequence_id) {
                const navSeq = seqById[step.navigation_sequence_id];
                if (navSeq) {
                    const navSeqNodeId = `seq-${step.navigation_sequence_id}`;
                    const isExpanded = expandedNodeIds.has(navSeqNodeId);

                    nodes.push({
                        id: navSeqNodeId,
                        type: 'custom',
                        data: {
                            label: navSeq.description || 'Navigation',
                            description: navSeq.intents?.map(i => i.text || i.type).join(' -> '),
                            type: 'intent_sequence',
                            nodeType: 'intent_sequence',
                            isNavigation: true,
                            intents: navSeq.intents,
                            isExpanded,
                            onToggleExpand
                        },
                        position: { x: currentX, y: baseY }
                    });

                    // Connect from last in-page sequence or state
                    const sourceId = lastInPageSeqId || stateNodeId;
                    edges.push({
                        id: `e-${sourceId}-${navSeqNodeId}`,
                        source: sourceId,
                        target: navSeqNodeId,
                        type: 'floating',
                        style: { stroke: '#f59e0b', strokeWidth: 2 },
                        markerEnd: { type: 'arrowclosed', color: '#f59e0b' }
                    });

                    currentX += SEQ_NODE_WIDTH + H_GAP;
                }
            }
        });
    } else {
        // Fallback: simple state_path based layout
        phrase.state_path.forEach((stateId, index) => {
            const state = stateById[stateId];
            if (!state) return;

            const stateNodeId = `state-${stateId}`;
            nodes.push({
                id: stateNodeId,
                type: 'custom',
                data: {
                    label: state.page_title || state.description || state.page_url || 'Page',
                    description: state.description || state.page_url,
                    type: 'state',
                    nodeType: 'state'
                },
                position: { x: currentX, y: baseY }
            });

            // Connect to previous state
            if (index > 0) {
                const prevStateId = phrase.state_path[index - 1];
                edges.push({
                    id: `e-state-${prevStateId}-${stateNodeId}`,
                    source: `state-${prevStateId}`,
                    target: stateNodeId,
                    type: 'floating',
                    animated: true,
                    style: { stroke: '#10b981', strokeWidth: 2 },
                    markerEnd: { type: 'arrowclosed', color: '#10b981' }
                });
            }

            currentX += PHRASE_NODE_WIDTH + H_GAP;
        });
    }

    return { nodes, edges };
};
