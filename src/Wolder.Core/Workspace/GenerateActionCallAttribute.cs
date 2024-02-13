namespace Wolder.Core.Workspace;

[AttributeUsage(AttributeTargets.Class, AllowMultiple = true, Inherited = false)]
public class GenerateActionCallAttribute<TAction> : Attribute
    where TAction : IInvokableAction
{
    
}