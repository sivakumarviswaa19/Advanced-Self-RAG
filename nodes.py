
from langchain_core.documents import Document
from typing import TypedDict,List,Literal
from langgraph.types import Command
from agents import llm


from agents import context_enrich,re_rank,retrieve,query_rewrite,split,load_documents,evaluator,format,rag_check

class State(TypedDict):
    query:str
    new_query:str
    docs:List[Document]
    original_context:List[str]
    split_context:List[Document]
    retrieved_data:str
    retrieved_chunks:List[Document]
    scored_chunks:List[Document]
    iterations:int
    feedback:int
    feedback_reason:str      # what the evaluator said was missing -> fed to re_writer
    final_ans:str



def loader(State):
    State["retrieved_chunks"]=[]
    # Reuse docs when the caller already supplied them (the API server caches
    # the parsed corpus across requests); otherwise read them from disk.
    docs=State.get("docs") or load_documents()
    State["docs"]=docs
    doc=[d.page_content for d in docs]
    context="\n".join(doc)
    State["original_context"]=context
    return State

def rag_checker(State):
    query=State["query"]
    content=State["original_context"]

    is_required=rag_check(query,content)

    if is_required:
        return "re_writer"
    else:
        return "general_responder"

def general_responder(State):
    query=State["query"]
    State["retrieved_data"]=llm.invoke(query).content.strip()
    return State

def splitter(State):
    docs=State["docs"]
    new_data=split(docs)
    State["split_context"]=new_data
    return State


def re_writer(State):

    State["new_query"]=query_rewrite(
        query=State["query"],
        previous=State.get("new_query"),
        score=State.get("feedback"),
        reason=State.get("feedback_reason"),
        attempt=State.get("iterations",0),
    )
    return State

def re_ranker(State):
    docs=State["retrieved_data"]
    query=State["new_query"]
    State["scored_chunks"]=re_rank(query,docs)
    return State

def context_enricher(State):
    query=State["new_query"]
    context=State["original_context"]
    docs=State["retrieved_data"]
    State["retrieved_data"]=context_enrich(query,docs,context)
    return State

def retriever(State):

    query=State["new_query"]
    docs=State["split_context"]
    State["retrieved_data"]=retrieve(query,docs)
    State["retrieved_chunks"]=State["retrieved_data"]
    return State

def evaluator_node(State):

    query=State["query"]
    ans=State["retrieved_data"]

    score,reason=evaluator(query,ans)
    State["feedback"]=score
    State["feedback_reason"]=reason

    State["iterations"]=State.get("iterations",0)+1
    return State

def route_after_evaluator(State):
    score=State["feedback"]
    iterations=State.get("iterations",0)

    if score<5 and iterations<3:
        return "re_writer"
    else:
        return "formatter"

def formatter(State):
    # re_ranker scores every chunk and keeps the best 5 in scored_chunks, but
    # that result was never read — the answer was written from the full
    # enriched set instead. Prefer the re-ranked chunks; fall back to
    # retrieved_data for the direct route, where re_rank never runs.
    ans=State.get("scored_chunks") or State["retrieved_data"]
    query=State["query"]
    State["final_ans"]=format(query,ans)

    return State














