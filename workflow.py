from langgraph.graph import StateGraph,START,END
from nodes import State,loader,general_responder,splitter,rag_checker,retriever,re_writer,re_ranker,route_after_evaluator,context_enricher,evaluator,formatter


graph=StateGraph(State)

graph.add_node("loader",loader)
graph.add_node("general_responder",general_responder)
graph.add_node("splitter",splitter)
graph.add_node("re_writer",re_writer)
graph.add_node("re_rank",re_ranker)
graph.add_node("context_enrich",context_enricher)
graph.add_node("retriever",retriever)
graph.add_node("evaluator",evaluator)
graph.add_node("formatter",formatter)

graph.add_edge(START,"loader")

graph.add_conditional_edges("loader",rag_checker,{
    "re_writer":"re_writer",
    "general_responder":"general_responder"
})

graph.add_edge("general_responder","formatter")

graph.add_edge("re_writer","splitter")
graph.add_edge("splitter","re_rank")
graph.add_edge("re_rank","context_enrich")
graph.add_edge("context_enrich","retriever")
graph.add_edge("retriever","evaluator")

graph.add_conditional_edges("evaluator",route_after_evaluator,{
    "re_writer":"re_writer",
    "formatter":"formatter"
})

graph.add_edge("formatter",END)


app=graph.compile()
