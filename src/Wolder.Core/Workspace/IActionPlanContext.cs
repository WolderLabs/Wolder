namespace Wolder.Core.Workspace;

public interface IActionPlanContext
{
    Task InvokeVoidActionAsync<TAction>()
        where TAction : IAction;
    
    Task<TOutput> InvokeActionAsync<TAction, TOutput>()
        where TAction : IAction<TOutput>;

    Task<TOutput> InvokeActionAsync<TAction, TParameter, TOutput>(
        TParameter options)
        where TAction : IAction<TParameter, TOutput>;
    
    Task InvokeVoidActionPlanAsync<TActionPlan>()
        where TActionPlan : IActionPlan;
    
    Task<TOutput> InvokeActionPlanAsync<TAction, TOutput>()
        where TAction : IActionPlan<TOutput>;

    Task<TOutput> InvokeActionPlanAsync<TAction, TParameter, TOutput>(
        TParameter options)
        where TAction : IActionPlan<TParameter, TOutput>;
}