namespace Wolder.Core.Workspace;

public interface IActionPlan
{
    Task InvokeAsync(IActionPlanContext context);
}

public interface IActionPlan<TOutput>
{
    Task<TOutput> InvokeAsync(IActionPlanContext initialState);
}

public interface IActionPlan<in TInput, TOutput>
{
    Task<TOutput> InvokeAsync(
        IActionPlanContext initialState, TInput options);
}
