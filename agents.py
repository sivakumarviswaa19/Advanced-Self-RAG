from dotenv import load_dotenv
load_dotenv()
import os

from langchain_openai import ChatOpenAI,OpenAIEmbeddings
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.retrievers import BM25Retriever
from langchain_core.documents import Document

#note -> evaluate and test with semantic chunking as well

llm=ChatOpenAI(model="gpt-4.1-mini",api_key=os.getenv("OPENAI_API_KEY"))

def load_documents():
    """load sample data documents from data folder"""

    documents=["data/Inter_Process_Communication.pdf","data/Process_Management.pdf","data/Real_Time_CPU_Scheduling.pdf",
               "data/Scheduling_Algorithm.pdf","data/Threads.pdf"]

    docs=[]
    for doc in documents:
        loader=PyPDFLoader(doc)
        d=loader.load()
        text="\n".join(i.page_content for i in d if i.page_content.strip())
        docs.append(Document(
            page_content=text,
            metadata={"Source":doc.split("/")[-1].replace(".pdf",""),"pages":len(d)}
        ))

    return docs

def split(docs):
    """Split the document recursively based on chunk size and overlap"""

    text_splitter=RecursiveCharacterTextSplitter(chunk_size=2000,chunk_overlap=200)
    split_docs=text_splitter.split_documents(docs)

    return split_docs


def retrieve(query,docs):
    """Retrieve related chunks from given data using similarity score and exact keyword match and combine results"""

    embedding = OpenAIEmbeddings(model="text-embedding-3-small")

    vectorstores = FAISS.from_documents(docs, embedding)

    retriever = vectorstores.as_retriever(search_kwargs={"k": 5}, search_type="mmr")

    keyword_retriever=BM25Retriever.from_documents(docs)
    keyword_retriever.k=4

    content1=retriever.invoke(query)
    content2=keyword_retriever.invoke(query)

    seen, merged = set(), []
    for d in content1 + content2:
        if d.page_content not in seen:
            seen.add(d.page_content)
            merged.append(d)

    return merged




def query_rewrite(query):

    prompt=f"""
You are a query rewriter for a vector-store retrieval system.

The previous retrieval for this question returned documents that were judged \
irrelevant. Rewrite the question so it retrieves better.

Reason about the underlying semantic intent, then produce ONE improved query.

Rules:
- Resolve pronouns and vague references into explicit entities.
- Add domain terms, synonyms, and likely document phrasing (retrieval matches \
document wording, not question wording).
- Drop conversational filler ("can you tell me", "I was wondering").
- Keep every constraint from the original (dates, names, versions, numbers).
- Do NOT answer the question, invent facts, or narrow the scope.
- Output only the rewritten query. No preamble, no quotes, no explanation.

Given query:{query}"""

    response=llm.invoke(prompt).content.strip()
    return response

def re_rank(query,chunks):

    scored=[]
    for chunk in chunks:
        prompt = f"""
            Evaluate how relevant the following document chunk is to answering the user’s query.

            Give a relevance score from 0 to 100, where:

            * 100 = directly and completely relevant
            * 70–99 = highly relevant
            * 40–69 = partially relevant
            * 1–39 = mostly irrelevant
            * 0 = completely irrelevant

            Return ONLY the numerical score. Do not provide an explanation.

            User query:
            {query}

            Document chunk:
            {chunk.page_content}"""

        response=llm.invoke(prompt).content.strip()
        scored.append((chunk,int(response)))

    scored.sort(key=lambda x: x[1], reverse=True)
    top_chunks=[doc for doc,score in scored[:5]]
    return top_chunks

def context_enrich(query,chunks,original_context):
    """ Enrich the context of each chunk with more info to get better relevance while retrieving"""



    for d in chunks:
        prompt = f"""
        You are a contextual enrichment component in a Retrieval-Augmented Generation (RAG) system.

        Your task is to generate a short piece of context that helps a retrieval system understand
        the meaning of the given document chunk when it is retrieved independently.

        Use ONLY information supported by the provided document context.
        Do not introduce new facts, assumptions, or interpretations.

        Document context:
        {original_context}

        Document chunk:
        {d.page_content}

        Generate a concise contextual description that explains:
        - what topic or concept this chunk discusses
        - where it fits within the document
        - any important entities, terminology, or relationships needed to understand the chunk

        Do not answer a question.
        Do not summarize the entire document.
        Do not repeat the chunk.
        Do not include information that is not supported by the document context.

        Return ONLY the contextual description.
        """

        response=llm.invoke(prompt).content.strip()
        d.page_content+="\n\n"+response

    return chunks

def evaluator(query,retrieved_data):
    EVAL_PROMPT = f"""You are evaluating a retrieval system.

    Rate how well the retrieved documents answer the user's question, on a scale of 1 to 10.

    Scale:
    1-2  — Nothing relevant. Wrong topic or wrong entity entirely.
    3-4  — Same general topic, but no information that helps answer the question.
    5-6  — Partially useful. Answers one part, or gives context but misses the core ask.
    7-8  — Answers the question, but with a gap: missing a detail, condition, or edge case.
    9-10 — Fully answers the question with all necessary supporting detail.

    Judge ONLY whether the information needed to answer is present in the documents. Do not reward fluency, length, or writing quality. Do not use your own knowledge to fill gaps — if the answer is not in the documents, it is not there.

    Question:
    {query}

    Retrieved documents:
    {retrieved_data}

    Return only the integer score of the retrieved data"""

    score = llm.invoke(EVAL_PROMPT).content.strip()
    return int(score)

def format(query,ans):
    FORMATTER_PROMPT = f"""You are answering a user's question using only the retrieved documents below.

    Rules:
    - Use ONLY information present in the documents. Never add outside knowledge.
    - If the documents do not contain the answer, say so plainly and stop. Do not guess.
    - Cite the source after each claim using [1], [2] matching the document numbers.
    - If sources conflict, state both and note the disagreement.
    - Lead with the direct answer in the first sentence, then supporting detail.
    - Match the question's scope: a yes/no question gets a short answer, a "how do I" question gets ordered steps.
    - Plain prose by default. Use a bulleted list only when the answer is genuinely a list of parallel items, and a code block only when the answer is code.
    - No preamble ("Based on the documents provided..."), no restating the question, no closing summary.

    Question:
    {query}

    Retrieved Data:
    {ans}

    """
    response=llm.invoke(FORMATTER_PROMPT).content.strip()
    return response

def rag_check(query,content):
    prompt = f"""
    You are a decision-making component in an agentic Retrieval-Augmented Generation (RAG) system.

    Your task is to decide whether the retrieved documents contain useful and sufficient
    information to answer the user's query.

    User query:
    {query}

    Retrieved documents:
    {content}

    Decision rules:

    1. Return "USE_RAG" if the retrieved documents contain relevant information that can
       be used to answer the query.
    2. Return "NO_RAG" if the query can be answered without the retrieved documents, or if
       the retrieved documents are irrelevant or contain no useful information.
    3. Return "RETRIEVE_AGAIN" if the query requires information from the documents, but
       the retrieved documents are insufficient, irrelevant, or incomplete.
    4. Do not answer the user's question.
    5. Do not make assumptions beyond the provided documents.
    6. Return ONLY one of:
       USE_RAG
       NO_RAG
       

    """

    decision=llm.invoke(prompt).content.strip()

    if decision.upper()=="USE_RAG":
        return True
    return False






