namespace Wolder.Core.Workspace;

public interface IActionPlan : IVoidInvokable
{
}

public interface IActionPlan<TOutput> : IInvokable<TOutput>
{
}

public interface IActionPlan<in TParameter, TOutput> : IInvokable<TOutput>
{
}
