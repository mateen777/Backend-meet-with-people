const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err))
    }
}


export { asyncHandler }


// explanation of above code
/* 
Certainly! The provided code is a function called asyncHandler 
that acts as middleware for handling asynchronous operations in Express.js or similar Node.js frameworks.

Here's a simple explanation of what the code does:
1. Function Structure:
    asyncHandler is a higher-order function that takes a requestHandler function 
    as its argument and returns another function that handles asynchronous operations 
    in Express middleware.

2.Returned Function:
    The returned function takes three parameters: req, res, and next, which are standard 
    Express middleware parameters representing the request, response, and next middleware 
    function.
    
3.Handling Asynchronous Operations:
    Inside the returned function, Promise.resolve() is used to wrap the invocation of the 
    requestHandler(req, res, next) function. This is done to handle asynchronous operations 
    that might occur within requestHandler.

3.Promise Handling:
    If requestHandler returns a promise (which is common for asynchronous operations like 
    database queries or API requests), Promise.resolve() ensures that it's properly handled.

4.Error Handling:
    The .catch() block is used to catch any errors that occur during the asynchronous operation. 
    If an error occurs, it calls next(err) to pass the error to Express's error handling 
    middleware (next function).

5.Exporting:
    The asyncHandler function is exported, allowing it to be used elsewhere in the codebase 
    where asynchronous operations need to be handled in middleware.

In summary, the asyncHandler function acts as a wrapper around other Express route handlers or 
middleware, ensuring that any asynchronous operations within those handlers are properly 
executed and any errors are appropriately forwarded to Express's error handling 
mechanism (next(err)). This helps in keeping the code cleaner by centralizing error handling 
for asynchronous operations.
*/



// const asyncHandler = () => {}
// const asyncHandler = (func) => () => {}
// const asyncHandler = (func) => async () => {}


// const asyncHandler = (fn) => async (req, res, next) => {
//     try {
//         await fn(req, res, next)
//     } catch (error) {
//         res.status(err.code || 500).json({
//             success: false,
//             message: err.message
//         })
//     }
// }